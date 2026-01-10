# Embeddings Integration Guide

## Current Context Flow (Simple, No Embeddings)

### Where Context Currently Comes From:

**File**: `backend/llm_runner.py`
- **Function**: `get_relevant_context()` (lines 41-91)
- **Current Method**: Time-based retrieval (no semantic search)
  - Gets 5 most recent episodes sorted by `start_ts`
  - Gets 10 most recent frames sorted by `ts`
  - Returns formatted text string with recent activity

**Called from**: `generate_stream()` function (line 99)
- Context is retrieved for EVERY user query
- Added as system message on first message
- Currently not query-aware (same context regardless of query)

### Current Context Format:
```
Recent Activity Episodes:
- Google Chrome: 15 screenshots, started at 2026-01-10 13:00:00
- VS Code: 8 screenshots, started at 2026-01-10 13:15:00

Recent Screenshots:
- 2026-01-10 13:59:37: Electron - Screenshot App
- 2026-01-10 13:58:37: Google Chrome - GitHub - Pull Requests
```

## Where to Add Embeddings (Integration Points)

### 1. Generate Embeddings When Creating Episodes/Frames

**When**: Episodes and frames are created in `main.py`

#### For Episodes (when app_name changes):

**Location**: `main.py` - `/api/activity` endpoint or `/api/screenshot-upload` endpoint

**Add embedding generation**:
```python
# In main.py, after creating episode
from llm_runner import generate_text_embedding  # We'll create this

# After inserting episode
episode_text = f"{app_name} activity session starting at {datetime.fromtimestamp(ts/1000)}"
text_embedding = await generate_text_embedding(episode_text)

# Update episode with embedding
episodes_collection.update_one(
    {"episode_id": episode_id},
    {"$set": {"text_embedding": text_embedding}}
)
```

#### For Frames (when screenshot is uploaded):

**Location**: `main.py` - `/api/screenshot-upload` endpoint (around line 330)

**Add embedding generation**:
```python
# After creating frame document
frame_text = f"{app_name} - {window_title or 'N/A'}"
frame_text_embedding = await generate_text_embedding(frame_text)

# If blob_url exists, also generate image embedding
frame_image_embedding = None
if blob_url:
    frame_image_embedding = await generate_image_embedding(blob_url)

# Update frame with embeddings
frame_doc["text_embedding"] = frame_text_embedding
frame_doc["image_embedding"] = frame_image_embedding
```

### 2. Update MongoDB Schema to Store Embeddings

**MongoDB Collections** (already have these fields ready):

**Episodes Collection**:
```python
{
    "episode_id": "uuid",
    "app_name": "Google Chrome",
    "text_embedding": [0.123, 0.456, ...],  # ADD THIS - array of floats
    # ... other fields
}
```

**Frames Collection**:
```python
{
    "frame_id": "uuid",
    "episode_id": "uuid",
    "app_name": "Google Chrome",
    "window_title": "GitHub - Pull Requests",
    "text_embedding": [0.123, 0.456, ...],  # ADD THIS - for text content
    "image_embedding": [0.789, 0.012, ...],  # ADD THIS - for screenshot image
    "blob_url": "https://...",  # Use this for image embedding
    # ... other fields
}
```

### 3. Replace Simple Context with Semantic Search

**Location**: `llm_runner.py` - `get_relevant_context()` function

**Replace current implementation with**:
```python
async def get_relevant_context_semantic(user_query: str, limit: int = 5) -> str:
    """
    Retrieves relevant context using semantic search with embeddings.
    """
    frames_collection = get_frames_collection()
    episodes_collection = get_episodes_collection()
    
    if frames_collection is None or episodes_collection is None:
        return "Database unavailable. Context cannot be retrieved."
    
    try:
        # Generate embedding for user query
        query_embedding = await generate_text_embedding(user_query)
        
        # Semantic search in episodes
        episode_results = episodes_collection.aggregate([
            {
                "$vectorSearch": {
                    "index": "vector_search_episode_embedding",  # Create in Atlas UI
                    "path": "text_embedding",
                    "queryVector": query_embedding,
                    "numCandidates": limit * 10,
                    "limit": limit,
                }
            },
            {
                "$project": {
                    "episode_id": 1,
                    "app_name": 1,
                    "frame_count": 1,
                    "start_ts": 1,
                    "score": {"$meta": "vectorSearchScore"}
                }
            }
        ])
        
        # Semantic search in frames
        frame_results = frames_collection.aggregate([
            {
                "$vectorSearch": {
                    "index": "vector_search_frame_embedding",  # Create in Atlas UI
                    "path": "text_embedding",
                    "queryVector": query_embedding,
                    "numCandidates": limit * 10,
                    "limit": limit,
                }
            },
            {
                "$project": {
                    "frame_id": 1,
                    "app_name": 1,
                    "window_title": 1,
                    "ts": 1,
                    "score": {"$meta": "vectorSearchScore"}
                }
            }
        ])
        
        # Format results
        context_parts = []
        
        episodes = list(episode_results)
        if episodes:
            context_parts.append("Relevant Episodes (semantic search):")
            for ep in episodes:
                app_name = ep.get("app_name", "Unknown")
                frame_count = ep.get("frame_count", 0)
                score = ep.get("score", 0)
                start_ts = ep.get("start_ts", 0)
                start_date = datetime.fromtimestamp(start_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                context_parts.append(f"- {app_name}: {frame_count} screenshots, {start_date} (relevance: {score:.3f})")
        
        frames = list(frame_results)
        if frames:
            context_parts.append("\nRelevant Screenshots (semantic search):")
            for frame in frames:
                app_name = frame.get("app_name", "Unknown")
                window_title = frame.get("window_title", "N/A")
                score = frame.get("score", 0)
                ts = frame.get("ts", 0)
                frame_date = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
                context_parts.append(f"- {frame_date}: {app_name} - {window_title} (relevance: {score:.3f})")
        
        return "\n".join(context_parts) if context_parts else "No relevant context found."
    
    except Exception as e:
        print(f"[CONTEXT] Error in semantic search: {e}")
        # Fallback to simple context
        return await get_relevant_context_simple(user_query, limit)
```

## Implementation Steps

### Step 1: Create Embedding Functions

**File**: `backend/llm_runner.py` or create `backend/embeddings.py`

```python
# backend/embeddings.py
import os
import httpx
from typing import List, Optional

VOYAGE_API_BASE = 'https://api.voyageai.com/v1'
DEFAULT_TEXT_MODEL = 'voyage-2'
DEFAULT_IMAGE_MODEL = 'voyage-large-2'

async def generate_text_embedding(text: str) -> List[float]:
    """Generate text embedding using Voyage AI"""
    api_key = os.getenv("VOYAGE_API_KEY")
    if not api_key:
        raise ValueError("VOYAGE_API_KEY environment variable is not set")
    
    model = os.getenv("VOYAGE_TEXT_MODEL", DEFAULT_TEXT_MODEL)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{VOYAGE_API_BASE}/embeddings",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "input": [text],
                "model": model,
            },
            timeout=30.0,
        )
        
        if response.status_code != 200:
            raise Exception(f"Voyage API error: {response.status_code} - {response.text}")
        
        data = response.json()
        if not data.get("data") or not data["data"][0].get("embedding"):
            raise Exception("Invalid response from Voyage API")
        
        return data["data"][0]["embedding"]

async def generate_image_embedding(image_url: str) -> List[float]:
    """Generate image embedding using Voyage AI"""
    api_key = os.getenv("VOYAGE_API_KEY")
    if not api_key:
        raise ValueError("VOYAGE_API_KEY environment variable is not set")
    
    model = os.getenv("VOYAGE_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{VOYAGE_API_BASE}/embeddings",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "input": [{"image_url": image_url}],
                "model": model,
            },
            timeout=60.0,
        )
        
        if response.status_code != 200:
            raise Exception(f"Voyage API error: {response.status_code} - {response.text}")
        
        data = response.json()
        if not data.get("data") or not data["data"][0].get("embedding"):
            raise Exception("Invalid response from Voyage API")
        
        return data["data"][0]["embedding"]
```

### Step 2: Update MongoDB Schema

**Update frames/episodes documents to include embedding fields**:
- `text_embedding`: List[float] - for text-based semantic search
- `image_embedding`: List[float] - for image-based semantic search (optional)

### Step 3: Generate Embeddings When Creating Data

**In `main.py`**:
- When episode is created → generate text embedding from `app_name` + metadata
- When frame is created → generate text embedding from `app_name` + `window_title`, optionally image embedding from `blob_url`

### Step 4: Create MongoDB Vector Search Indexes

**In MongoDB Atlas UI**:
1. Go to your cluster → Atlas Search → Create Search Index
2. **Index 1**: `vector_search_episode_embedding`
   - Collection: `episodes`
   - Field: `text_embedding`
   - Type: `vector`
   - Dimensions: `1024` (for voyage-2 model)
3. **Index 2**: `vector_search_frame_embedding`
   - Collection: `frames`
   - Field: `text_embedding`
   - Type: `vector`
   - Dimensions: `1024`
4. **Index 3** (Optional): `vector_search_frame_image_embedding`
   - Collection: `frames`
   - Field: `image_embedding`
   - Type: `vector`
   - Dimensions: `1024` (or check Voyage image model dimensions)

### Step 5: Replace Context Retrieval

**In `llm_runner.py`**:
- Replace `get_relevant_context()` with `get_relevant_context_semantic()`
- Use vector search instead of time-based retrieval
- Make context query-aware (relevant to user's question)

## Current vs. Future Context Flow

### Current (Simple):
```
User Query → get_relevant_context() → Recent 5 episodes + 10 frames → System Message → LLM
```
- ❌ Not query-aware (same context regardless of query)
- ❌ Time-based only (not semantic)
- ❌ No embeddings

### Future (With Embeddings):
```
User Query → Generate Query Embedding → Vector Search in MongoDB → Relevant Episodes/Frames → System Message → LLM
```
- ✅ Query-aware (context matches user's question)
- ✅ Semantic search (finds similar content, not just recent)
- ✅ Uses embeddings for similarity

## Example Query Flow

**User asks**: "What was I doing in Chrome yesterday?"

1. **Generate query embedding**: `[0.123, 0.456, ...]`
2. **Vector search in episodes**: Find episodes with `app_name: "Chrome"` that are semantically similar
3. **Vector search in frames**: Find frames with Chrome app_name, similar to query
4. **Format context**: "Relevant Episodes: Chrome - GitHub (15 screenshots) ..."
5. **Send to LLM**: With semantic context instead of just "recent activity"

## Next Steps

1. ✅ Add `httpx` to `requirements.txt` (already there)
2. ⬜ Create `embeddings.py` with embedding functions
3. ⬜ Update `main.py` to generate embeddings when creating episodes/frames
4. ⬜ Update `llm_runner.py` to use semantic search
5. ⬜ Create MongoDB vector search indexes in Atlas UI
6. ⬜ Add `VOYAGE_API_KEY` to `.env` file
7. ⬜ Test semantic search with queries

## Environment Variables Needed

Add to `.env` in `my-c1-app/`:
```env
VOYAGE_API_KEY=your-voyage-api-key
VOYAGE_TEXT_MODEL=voyage-2  # Optional, defaults to voyage-2
VOYAGE_IMAGE_MODEL=voyage-large-2  # Optional, defaults to voyage-large-2
```

## Reference: Your Friend's TypeScript Implementation

See `/w24h/src/voyage.ts` and `/w24h/src/routes/query.ts` for a working example:
- Text embedding generation
- Vector search in MongoDB
- Error handling and fallbacks

