"""
Test reranker with real episodes from the database
"""

import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
from db import get_episodes_collection
from voyage import embed_text, rerank
from llm_runner import cosine_similarity

# Load environment variables
env_paths = [
    Path(__file__).parent / '.env',
    Path(__file__).parent.parent / '.env',
    Path(__file__).parent.parent.parent / '.env',
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[TEST] Loaded .env from: {env_path}")
        break
else:
    print("[TEST] Warning: No .env file found")

VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")


async def test_reranker_with_real_episodes():
    """Test reranker with actual episodes from the database"""
    print("\n" + "="*60)
    print("Testing Reranker with Real Episodes")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("❌ VOYAGE_API_KEY not set in environment")
        return False
    
    episodes_collection = get_episodes_collection()
    if episodes_collection is None:
        print("❌ Could not connect to MongoDB")
        return False
    
    # Get all episodes with embeddings
    episodes = list(episodes_collection.find({
        "text_embedding": {"$exists": True, "$ne": None},
        "summary": {"$exists": True, "$ne": None}
    }))
    
    total_episodes = episodes_collection.count_documents({})
    episodes_with_embeddings = len(episodes)
    
    print(f"\nDatabase Status:")
    print(f"  Total episodes: {total_episodes}")
    print(f"  Episodes with embeddings: {episodes_with_embeddings}")
    
    if episodes_with_embeddings == 0:
        print("\n⚠️  No episodes with embeddings found!")
        print("   Run batch_embed.py first to generate embeddings for episodes")
        return False
    
    if episodes_with_embeddings < 2:
        print(f"\n⚠️  Only {episodes_with_embeddings} episode(s) with embeddings found.")
        print("   Reranking works best with multiple episodes, but we'll test with what we have.")
    
    # Test queries
    test_queries = [
        "working on code",
        "browsing the web",
        "using Chrome",
        "development work",
        "recent activity"
    ]
    
    for query in test_queries:
        print(f"\n{'='*60}")
        print(f"Query: '{query}'")
        print(f"{'='*60}")
        
        try:
            # Generate query embedding
            print("Generating query embedding...")
            query_embedding = await embed_text(query)
            
            # Calculate similarity scores
            print(f"Calculating similarity for {len(episodes)} episodes...")
            episode_scores = []
            for episode in episodes:
                text_embedding = episode.get("text_embedding")
                if text_embedding:
                    similarity = cosine_similarity(query_embedding, text_embedding)
                    episode_scores.append((similarity, episode))
            
            # Sort by similarity
            episode_scores.sort(key=lambda x: x[0], reverse=True)
            
            # Show top episodes by similarity
            print(f"\nTop {min(3, len(episode_scores))} episodes by similarity:")
            for i, (score, episode) in enumerate(episode_scores[:3], 1):
                app_name = episode.get("app_name", "Unknown")
                summary = episode.get("summary", "No summary")
                print(f"  {i}. [Similarity: {score:.4f}] {app_name}")
                print(f"     {summary[:80]}...")
            
            # Prepare documents for reranking
            episode_documents = []
            episode_metadata = []
            for score, episode in episode_scores:
                summary = episode.get("summary", "")
                app_name = episode.get("app_name", "Unknown")
                frame_count = episode.get("frame_count", 0)
                start_ts = episode.get("start_ts", 0)
                
                doc_text = f"App: {app_name}. {summary}"
                if start_ts:
                    start_date = datetime.fromtimestamp(start_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    doc_text += f" Started: {start_date}."
                
                episode_documents.append(doc_text)
                episode_metadata.append(episode)
            
            # Rerank if we have multiple episodes
            if len(episode_documents) >= 2:
                print(f"\nReranking {len(episode_documents)} episodes...")
                try:
                    rerank_results = await rerank(query, episode_documents, top_k=min(3, len(episode_documents)))
                    
                    if not rerank_results:
                        print("⚠️  Reranker returned no results - checking API response format...")
                        # Try without top_k to see what we get
                        rerank_results_all = await rerank(query, episode_documents)
                        print(f"   Reranker returned {len(rerank_results_all)} results without top_k")
                        rerank_results = rerank_results_all[:min(3, len(rerank_results_all))]
                    
                    if rerank_results:
                        print(f"\nTop {len(rerank_results)} episodes after reranking:")
                        for i, result in enumerate(rerank_results, 1):
                            idx = result["index"]
                            score = result["relevance_score"]
                            if idx < len(episode_metadata):
                                episode = episode_metadata[idx]
                                app_name = episode.get("app_name", "Unknown")
                                summary = episode.get("summary", "No summary")
                                original_similarity = episode_scores[idx][0]
                                
                                print(f"  {i}. [Rerank Score: {score:.4f}, Original Similarity: {original_similarity:.4f}] {app_name}")
                                print(f"     {summary[:80]}...")
                        
                        # Check if reranking changed the order
                        reranked_indices = [r["index"] for r in rerank_results]
                        similarity_indices = [i for i, _ in enumerate(episode_scores[:len(rerank_results)])]
                        
                        if reranked_indices != similarity_indices:
                            print("\n✅ Reranking changed the order - reranker is working!")
                            print(f"   Original order indices: {similarity_indices}")
                            print(f"   Reranked order indices: {reranked_indices}")
                        else:
                            print("\n⚠️  Reranking didn't change the order (may be because results were already well-ordered)")
                    else:
                        print("⚠️  No reranked results returned")
                except Exception as e:
                    print(f"❌ Error during reranking: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print(f"\n⚠️  Only {len(episode_documents)} episode(s) - reranking requires at least 2 episodes")
                print("   Showing episode by similarity:")
                for i, (score, episode) in enumerate(episode_scores, 1):
                    app_name = episode.get("app_name", "Unknown")
                    summary = episode.get("summary", "No summary")
                    print(f"  {i}. [Similarity: {score:.4f}] {app_name}")
                    print(f"     {summary[:80]}...")
        
        except Exception as e:
            print(f"❌ Error testing query '{query}': {e}")
            import traceback
            traceback.print_exc()
            continue
    
    return True


async def main():
    """Run reranker tests with real data"""
    print("\n" + "="*60)
    print("Reranker Verification with Real Episodes")
    print("="*60)
    
    if not VOYAGE_API_KEY:
        print("\n❌ VOYAGE_API_KEY environment variable is not set!")
        print("   Please set it in your .env file")
        return
    
    success = await test_reranker_with_real_episodes()
    
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    if success:
        print("✅ Reranker verification completed!")
    else:
        print("❌ Reranker verification failed or no data available")


if __name__ == "__main__":
    asyncio.run(main())

