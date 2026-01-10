from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from llm_runner import generate_stream, ChatRequest
from thesys_genui_sdk.fast_api import with_c1_response
from db import connect_db, get_frames_collection, get_episodes_collection, close_db
from voyage import embed_image, embed_text, generate_episode_summary
import httpx
import os
import time
import random
import string
import uuid
import asyncio
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file
# Try loading from backend directory, then parent directories
env_paths = [
    Path(__file__).parent / '.env',  # backend/.env
    Path(__file__).parent.parent / '.env',  # my-c1-project/.env
    Path(__file__).parent.parent.parent / '.env',  # my-c1-app/.env
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[SERVER] Loaded .env from: {env_path}")
        break
else:
    print("[SERVER] Warning: No .env file found in expected locations")

app = FastAPI()

# Add CORS middleware to allow Electron app to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your Electron app origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MongoDB connection on startup
@app.on_event("startup")
async def startup_event():
    try:
        db = connect_db()
        if db is not None:
            print("[SERVER] ✓ MongoDB connection initialized successfully")
        else:
            print("[SERVER] ⚠ MongoDB connection failed - app will continue in log-only mode")
            print("[SERVER] All data will be logged to console instead of stored in database")
    except Exception as e:
        print(f"[SERVER] ⚠ MongoDB connection error: {e}")
        print("[SERVER] App will continue but database operations will be skipped")

@app.on_event("shutdown")
async def shutdown_event():
    close_db()

@app.get("/")
def read_root():
    return {"status": "ok"}

@app.post("/chat")
@with_c1_response()
async def chat_endpoint(request: ChatRequest):
    await generate_stream(request)


# Simplified activity tracking - just store app_name for episode grouping
from pydantic import BaseModel
from typing import Optional


class AppInfo(BaseModel):
    appName: str
    windowTitle: Optional[str] = None


# Store last app_name for episode tracking (in production, use Redis or database)
last_app_name: Optional[str] = None
current_episode_id: Optional[str] = None


async def generate_frame_embedding(frame_id: str, blob_url: str, frames_collection):
    """
    Generate and store image embedding for a frame asynchronously
    """
    try:
        print(f"[EMBEDDING] Generating image embedding for frame: {frame_id}")
        embedding = await embed_image(blob_url)
        
        frames_collection.update_one(
            {"frame_id": frame_id},
            {"$set": {"image_embedding": embedding}}
        )
        print(f"[EMBEDDING] ✓ Image embedding stored for frame: {frame_id} ({len(embedding)} dimensions)")
    except Exception as e:
        print(f"[EMBEDDING] Error generating embedding for frame {frame_id}: {e}")


async def generate_episode_embedding_and_summary(episode_id: str, episodes_collection, frames_collection):
    """
    Generate summary and text embedding for a completed episode
    """
    try:
        # Get episode data
        episode = episodes_collection.find_one({"episode_id": episode_id})
        if not episode:
            print(f"[EMBEDDING] Episode {episode_id} not found")
            return
        
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
        print(f"[EMBEDDING] Generating summary for episode: {episode_id}")
        summary = await generate_episode_summary(
            app_name=app_name,
            frame_count=frame_count,
            start_ts=start_ts,
            end_ts=end_ts,
            window_titles=window_titles
        )
        
        # Generate text embedding from summary
        print(f"[EMBEDDING] Generating text embedding for episode: {episode_id}")
        text_embedding = await embed_text(summary)
        
        # Update episode with summary and embedding
        episodes_collection.update_one(
            {"episode_id": episode_id},
            {"$set": {
                "summary": summary,
                "text_embedding": text_embedding
            }}
        )
        print(f"[EMBEDDING] ✓ Summary and embedding stored for episode: {episode_id} ({len(text_embedding)} dimensions)")
    except Exception as e:
        print(f"[EMBEDDING] Error generating embedding for episode {episode_id}: {e}")


@app.post("/api/activity")
async def receive_activity(app_info: AppInfo):
    """
    Receive app_name information for episode tracking.
    Simplified version - only stores app_name to determine episode boundaries.
    Works even if MongoDB is unavailable (logs to console instead).
    """
    global last_app_name, current_episode_id
    
    try:
        app_name = app_info.appName
        
        # Log for debugging
        print(f"[ACTIVITY] App: {app_name}, Window: {app_info.windowTitle or 'N/A'}")
        
        # Check if app_name changed (new episode)
        if app_name != last_app_name:
            print(f"[ACTIVITY] App changed: {last_app_name} → {app_name}")
            
            # Try to store in MongoDB, but don't fail if unavailable
            episodes_collection = get_episodes_collection()
            if episodes_collection is not None:
                try:
                    # If there was a previous episode, close it
                    if current_episode_id and last_app_name:
                        end_ts = int(time.time() * 1000)
                        episodes_collection.update_one(
                            {"episode_id": current_episode_id},
                            {"$set": {"end_ts": end_ts, "updated_at": datetime.utcnow()}}
                        )
                        print(f"[ACTIVITY] Closed episode in DB: {current_episode_id}")
                        
                        # Generate summary and embedding for closed episode (async, don't wait)
                        frames_collection = get_frames_collection()
                        if frames_collection is not None:
                            asyncio.create_task(generate_episode_embedding_and_summary(
                                current_episode_id, episodes_collection, frames_collection
                            ))
                    
                    # Create new episode
                    new_episode_id = str(uuid.uuid4())
                    episodes_collection.insert_one({
                        "episode_id": new_episode_id,
                        "app_name": app_name,
                        "frame_ids": [],
                        "start_ts": int(time.time() * 1000),
                        "end_ts": None,
                        "frame_count": 0,
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                    })
                    
                    current_episode_id = new_episode_id
                    last_app_name = app_name
                    print(f"[ACTIVITY] Created new episode in DB: {new_episode_id} for app: {app_name}")
                except Exception as db_error:
                    print(f"[ACTIVITY] Warning: Could not store in database: {db_error}")
                    print(f"[ACTIVITY] Continuing in log-only mode...")
                    # Generate episode ID even without DB for tracking
                    current_episode_id = str(uuid.uuid4())
                    last_app_name = app_name
                    print(f"[ACTIVITY] Episode (log-only): {current_episode_id} for app: {app_name}")
            else:
                # MongoDB not available - log-only mode
                current_episode_id = str(uuid.uuid4())
                last_app_name = app_name
                print(f"[ACTIVITY] Episode (log-only, MongoDB unavailable): {current_episode_id} for app: {app_name}")
        
        return JSONResponse(content={
            "status": "success",
            "app_name": app_name,
            "episode_id": current_episode_id,
        })
    
    except Exception as e:
        print(f"[ACTIVITY] Error processing activity data: {str(e)}")
        import traceback
        traceback.print_exc()
        # Don't raise HTTPException - return success even if DB fails
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "app_name": app_info.appName,
                "episode_id": None,
                "warning": "Database unavailable, operating in log-only mode"
            }
        )


@app.post("/api/screenshot-upload")
async def screenshot_upload(
    file: UploadFile = File(...),
    pathname: Optional[str] = Form(None),
    app_name: Optional[str] = Form(None),
    window_title: Optional[str] = Form(None),
    local_path: Optional[str] = Form(None),
):
    """
    Handle screenshot uploads to Vercel Blob and store frame in MongoDB.
    Creates/updates episodes based on app_name changes.
    """
    global last_app_name, current_episode_id
    
    # Verify BLOB_READ_WRITE_TOKEN is configured
    blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
    if not blob_token:
        print("[SERVER] BLOB_READ_WRITE_TOKEN is not set in environment variables")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error: BLOB_READ_WRITE_TOKEN not configured"
        )
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Validate content type
        allowed_types = ["image/png", "image/jpeg", "image/webp"]
        content_type = file.content_type or "image/png"
        if content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid content type: {content_type}. Allowed: {', '.join(allowed_types)}"
            )
        
        # Generate pathname if not provided
        if not pathname:
            timestamp = int(time.time() * 1000)
            pathname = f"screenshots/{timestamp}-{file.filename or 'screenshot.png'}"
        
        # Validate pathname starts with screenshots/
        if not pathname.startswith("screenshots/"):
            raise HTTPException(
                status_code=400,
                detail="Invalid upload path. Must start with 'screenshots/'"
            )
        
        # Add random suffix to prevent collisions
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        pathname_with_suffix = f"{pathname.rsplit('.', 1)[0]}-{random_suffix}.{pathname.rsplit('.', 1)[-1] if '.' in pathname else 'png'}"
        
        print(f"[SERVER] Uploading to Vercel Blob: {pathname_with_suffix}")
        print(f"[SERVER] File size: {len(file_content)} bytes")
        print(f"[SERVER] Content type: {content_type}")
        print(f"[SERVER] App name: {app_name}, Window: {window_title}")
        
        # Upload to Vercel Blob using PUT request
        blob_url = None
        try:
            async with httpx.AsyncClient() as client:
                response = await client.put(
                    f"https://blob.vercel-storage.com/{pathname_with_suffix}",
                    headers={
                        "Authorization": f"Bearer {blob_token}",
                        "Content-Type": content_type,
                        "x-access-type": "public",
                    },
                    content=file_content,
                    timeout=60.0,
                )
                
                if response.status_code not in [200, 201]:
                    error_text = response.text
                    print(f"[SERVER] Vercel Blob API error: {response.status_code} - {error_text}")
                    # Don't fail if blob upload fails, still store frame locally
                else:
                    result = response.json()
                    blob_url = result.get("url", "")
                    print(f"[SERVER] ✓ Screenshot uploaded successfully to Vercel Blob: {blob_url}")
        except Exception as e:
            print(f"[SERVER] Warning: Vercel Blob upload failed: {e}")
            # Continue to store frame even if blob upload fails
        
        # Timestamp for this frame
        ts = int(time.time() * 1000)
        
        # Handle episode creation/update based on app_name
        # Try to store in MongoDB, but don't fail if unavailable
        app_name = app_name or "Unknown"
        episode_id = current_episode_id
        frame_id = str(uuid.uuid4())
        
        episodes_collection = get_episodes_collection()
        frames_collection = get_frames_collection()
        
        if episodes_collection is not None and frames_collection is not None:
            # MongoDB is available - store in database
            try:
                # Check if app_name changed (new episode needed)
                if app_name != last_app_name:
                    # Close previous episode if exists
                    if current_episode_id and last_app_name:
                        episodes_collection.update_one(
                            {"episode_id": current_episode_id, "end_ts": None},
                            {"$set": {
                                "end_ts": ts - 1000,  # Set end_ts to just before this frame
                                "updated_at": datetime.utcnow()
                            }}
                        )
                        print(f"[SERVER] Closed episode in DB: {current_episode_id} for app: {last_app_name}")
                        
                        # Generate summary and embedding for closed episode (async, don't wait)
                        asyncio.create_task(generate_episode_embedding_and_summary(
                            current_episode_id, episodes_collection, frames_collection
                        ))
                    
                    # Create new episode for new app_name
                    new_episode_id = str(uuid.uuid4())
                    episodes_collection.insert_one({
                        "episode_id": new_episode_id,
                        "app_name": app_name,
                        "frame_ids": [],
                        "start_ts": ts,
                        "end_ts": None,  # Will be updated with each new frame or when app changes
                        "frame_count": 0,
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                    })
                    
                    episode_id = new_episode_id
                    current_episode_id = new_episode_id
                    last_app_name = app_name
                    print(f"[SERVER] Created new episode in DB: {episode_id} for app: {app_name}")
                
                # Get current episode ID (use existing or newly created)
                if not episode_id:
                    episode_id = str(uuid.uuid4())
                    episodes_collection.insert_one({
                        "episode_id": episode_id,
                        "app_name": app_name,
                        "frame_ids": [],
                        "start_ts": ts,
                        "end_ts": None,
                        "frame_count": 0,
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                    })
                    current_episode_id = episode_id
                    last_app_name = app_name
                    print(f"[SERVER] Created initial episode in DB: {episode_id} for app: {app_name}")
                
                # Create frame document in MongoDB
                frame_doc = {
                    "frame_id": frame_id,
                    "episode_id": episode_id,
                    "ts": ts,
                    "app_name": app_name,
                    "window_title": window_title,
                    "screenshot_path": local_path or pathname_with_suffix,
                    "blob_url": blob_url,
                    "blob_pathname": pathname_with_suffix if blob_url else None,
                    "file_size": len(file_content),
                    "content_type": content_type,
                    "created_at": datetime.utcnow(),
                }
                
                frames_collection.insert_one(frame_doc)
                print(f"[SERVER] ✓ Frame stored in MongoDB: {frame_id}")
                
                # Generate image embedding if blob_url is available (async, don't wait)
                if blob_url:
                    asyncio.create_task(generate_frame_embedding(
                        frame_id, blob_url, frames_collection
                    ))
                
                # Update episode to include this frame
                episodes_collection.update_one(
                    {"episode_id": episode_id},
                    {
                        "$push": {"frame_ids": frame_id},
                        "$inc": {"frame_count": 1},
                        "$set": {
                            "end_ts": ts,  # Update end time with each frame (episode continues)
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                print(f"[SERVER] ✓ Updated episode in DB: {episode_id} with frame: {frame_id} (frame_count: +1)")
                
            except Exception as db_error:
                print(f"[SERVER] Warning: Could not store in database: {db_error}")
                print(f"[SERVER] Continuing in log-only mode...")
                # Generate IDs even without DB for tracking
                if not episode_id:
                    episode_id = str(uuid.uuid4())
                    current_episode_id = episode_id
                    last_app_name = app_name
                print(f"[SERVER] Frame (log-only): {frame_id}, Episode: {episode_id}, App: {app_name}")
        else:
            # MongoDB not available - log-only mode
            if app_name != last_app_name or not episode_id:
                episode_id = str(uuid.uuid4())
                current_episode_id = episode_id
                last_app_name = app_name
            print(f"[SERVER] Frame (log-only, MongoDB unavailable): {frame_id}, Episode: {episode_id}, App: {app_name}")
            print(f"[SERVER] Blob URL: {blob_url or 'N/A'}, Local path: {local_path or pathname_with_suffix}")
        
        return JSONResponse(content={
            "success": True,
            "frame_id": frame_id,
            "episode_id": episode_id,
            "url": blob_url,
            "pathname": pathname_with_suffix,
            "contentType": content_type,
        })
    
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        print(f"[SERVER] HTTP error connecting to Vercel Blob: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to Vercel Blob API: {str(e)}"
        )
    except Exception as e:
        print(f"[SERVER] Upload error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Upload error: {str(e)}"
        )
