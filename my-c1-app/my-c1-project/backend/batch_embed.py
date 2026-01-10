"""
Batch processing script to generate embeddings for existing frames and episodes
"""

import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
from db import connect_db, get_frames_collection, get_episodes_collection
from voyage import embed_text, embed_image, generate_episode_summary

# Load environment variables
env_paths = [
    Path(__file__).parent / '.env',
    Path(__file__).parent.parent / '.env',
    Path(__file__).parent.parent.parent / '.env',
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[BATCH] Loaded .env from: {env_path}")
        break
else:
    print("[BATCH] Warning: No .env file found")

VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")


async def process_frame(frame, frames_collection):
    """Process a single frame to generate embedding"""
    frame_id = frame.get("frame_id")
    blob_url = frame.get("blob_url")
    
    if not blob_url:
        print(f"  ⚠️  Frame {frame_id}: No blob_url, skipping")
        return False
    
    try:
        print(f"  📸 Processing frame {frame_id}...")
        embedding = await embed_image(blob_url)
        
        frames_collection.update_one(
            {"frame_id": frame_id},
            {"$set": {"image_embedding": embedding}}
        )
        
        print(f"  ✅ Frame {frame_id}: Embedding generated ({len(embedding)} dimensions)")
        return True
    except Exception as e:
        print(f"  ❌ Frame {frame_id}: Error - {e}")
        return False


async def process_episode(episode, episodes_collection, frames_collection):
    """Process a single episode to generate summary and embedding"""
    episode_id = episode.get("episode_id")
    
    try:
        print(f"  📄 Processing episode {episode_id}...")
        
        app_name = episode.get("app_name", "Unknown")
        frame_count = episode.get("frame_count", 0)
        start_ts = episode.get("start_ts", 0)
        end_ts = episode.get("end_ts")
        frame_ids = episode.get("frame_ids", [])
        
        # Get window titles from frames
        window_titles = []
        if frame_ids:
            frames = list(frames_collection.find(
                {"frame_id": {"$in": frame_ids}},
                {"window_title": 1}
            ))
            window_titles = [f.get("window_title") for f in frames if f.get("window_title")]
        
        # Generate summary
        summary = await generate_episode_summary(
            app_name=app_name,
            frame_count=frame_count,
            start_ts=start_ts,
            end_ts=end_ts,
            window_titles=window_titles
        )
        
        # Generate text embedding from summary
        text_embedding = await embed_text(summary)
        
        # Update episode
        episodes_collection.update_one(
            {"episode_id": episode_id},
            {"$set": {
                "summary": summary,
                "text_embedding": text_embedding
            }}
        )
        
        print(f"  ✅ Episode {episode_id}: Summary and embedding generated")
        print(f"     Summary: {summary[:80]}...")
        print(f"     Embedding dimensions: {len(text_embedding)}")
        return True
    except Exception as e:
        print(f"  ❌ Episode {episode_id}: Error - {e}")
        import traceback
        traceback.print_exc()
        return False


async def process_frames(frames_collection, limit=None, delay=1.0):
    """Process all frames without embeddings"""
    print("\n" + "="*60)
    print("Processing Frames")
    print("="*60)
    
    # Find frames without embeddings (missing or null)
    query = {
        "$or": [
            {"image_embedding": {"$exists": False}},
            {"image_embedding": None}
        ]
    }
    if limit:
        frames = list(frames_collection.find(query).limit(limit))
    else:
        frames = list(frames_collection.find(query))
    
    total = len(frames)
    print(f"Found {total} frames without embeddings")
    
    if total == 0:
        print("✅ All frames already have embeddings")
        return 0, 0
    
    print(f"Processing {total} frames...")
    print(f"Delay between requests: {delay} seconds (to avoid rate limits)\n")
    
    processed = 0
    failed = 0
    
    for i, frame in enumerate(frames, 1):
        print(f"[{i}/{total}] Frame {frame.get('frame_id')}")
        success = await process_frame(frame, frames_collection)
        
        if success:
            processed += 1
        else:
            failed += 1
        
        # Add delay to avoid rate limits (except for last item)
        if i < total:
            await asyncio.sleep(delay)
    
    print(f"\n✅ Processed: {processed}, Failed: {failed}, Total: {total}")
    return processed, failed


async def process_episodes(episodes_collection, frames_collection, limit=None, delay=1.0):
    """Process all episodes without summaries or embeddings"""
    print("\n" + "="*60)
    print("Processing Episodes")
    print("="*60)
    
    # Find episodes without summaries or embeddings
    # We'll process episodes that are missing either summary or text_embedding
    query = {
        "$or": [
            {"summary": {"$exists": False}},
            {"summary": None},
            {"text_embedding": {"$exists": False}},
            {"text_embedding": None}
        ]
    }
    
    if limit:
        episodes = list(episodes_collection.find(query).limit(limit))
    else:
        episodes = list(episodes_collection.find(query))
    
    total = len(episodes)
    print(f"Found {total} episodes without summaries/embeddings")
    
    if total == 0:
        print("✅ All episodes already have summaries and embeddings")
        return 0, 0
    
    print(f"Processing {total} episodes...")
    print(f"Delay between requests: {delay} seconds (to avoid rate limits)\n")
    
    processed = 0
    failed = 0
    
    for i, episode in enumerate(episodes, 1):
        episode_id = episode.get("episode_id")
        app_name = episode.get("app_name", "Unknown")
        print(f"[{i}/{total}] Episode {episode_id} ({app_name})")
        
        success = await process_episode(episode, episodes_collection, frames_collection)
        
        if success:
            processed += 1
        else:
            failed += 1
        
        # Add delay to avoid rate limits (except for last item)
        if i < total:
            await asyncio.sleep(delay)
    
    print(f"\n✅ Processed: {processed}, Failed: {failed}, Total: {total}")
    return processed, failed


async def main():
    """Main batch processing function"""
    print("\n" + "="*60)
    print("Batch Embedding Generation")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("\n❌ VOYAGE_API_KEY environment variable is not set!")
        print("   Please set it in your .env file")
        return
    
    # Connect to database
    db = connect_db()
    if db is None:
        print("\n❌ Could not connect to MongoDB")
        print("   Please check your MONGODB_URI in .env file")
        return
    
    frames_collection = get_frames_collection()
    episodes_collection = get_episodes_collection()
    
    if frames_collection is None or episodes_collection is None:
        print("\n❌ Could not access MongoDB collections")
        return
    
    # Get counts
    total_frames = frames_collection.count_documents({})
    frames_with_embeddings = frames_collection.count_documents({"image_embedding": {"$exists": True, "$ne": None}})
    
    total_episodes = episodes_collection.count_documents({})
    episodes_with_embeddings = episodes_collection.count_documents({
        "text_embedding": {"$exists": True, "$ne": None},
        "summary": {"$exists": True, "$ne": None}
    })
    
    print(f"\nDatabase Status:")
    print(f"  Frames: {frames_with_embeddings}/{total_frames} have embeddings")
    print(f"  Episodes: {episodes_with_embeddings}/{total_episodes} have summaries/embeddings")
    
    # Ask user what to process (for now, process both)
    print("\nProcessing all missing embeddings...")
    
    # Process frames
    frames_processed, frames_failed = await process_frames(frames_collection, delay=1.0)
    
    # Process episodes
    episodes_processed, episodes_failed = await process_episodes(
        episodes_collection, frames_collection, delay=1.0
    )
    
    # Final summary
    print("\n" + "="*60)
    print("Batch Processing Complete")
    print("="*60)
    print(f"Frames: {frames_processed} processed, {frames_failed} failed")
    print(f"Episodes: {episodes_processed} processed, {episodes_failed} failed")
    
    # Updated counts
    frames_with_embeddings_after = frames_collection.count_documents({"image_embedding": {"$exists": True, "$ne": None}})
    episodes_with_embeddings_after = episodes_collection.count_documents({
        "text_embedding": {"$exists": True, "$ne": None},
        "summary": {"$exists": True, "$ne": None}
    })
    
    print(f"\nUpdated Status:")
    print(f"  Frames: {frames_with_embeddings_after}/{total_frames} have embeddings")
    print(f"  Episodes: {episodes_with_embeddings_after}/{total_episodes} have summaries/embeddings")


if __name__ == "__main__":
    asyncio.run(main())

