# Where Context Comes From - Quick Reference

## Current Context Source (Right Now)

### Location: `backend/llm_runner.py`

#### 1. **Function**: `get_relevant_context()` 
   - **Lines**: 41-91
   - **Called from**: Line 99 in `generate_stream()`
   - **What it does**: 
     - Retrieves recent episodes/frames from MongoDB
     - Time-based (not semantic)
     - Returns formatted text string

#### 2. **Function**: `generate_stream()`
   - **Lines**: 94-154
   - **Line 99**: Calls `get_relevant_context(user_query)`
   - **Line 103-114**: Adds context as system message (only on first message)
   - **Line 131-134**: Sends conversation history (with context) to OpenAI

### Current Context Flow:
```
User Query → llm_runner.py:99 (get_relevant_context)
                ↓
            MongoDB Query (recent episodes/frames by timestamp)
                ↓
            Format as text string
                ↓
            llm_runner.py:103-114 (Add as system message)
                ↓
            llm_runner.py:131 (Send to OpenAI with context)
```

## Where to Add Embeddings (Integration Points)

### Point 1: Generate Embeddings When Creating Episodes

**File**: `backend/main.py`
- **Endpoint**: `/api/activity` (line 84-145)
- **When**: New episode is created (line 121-123)
- **Add after line 123**:
  ```python
  # Generate embedding for episode
  from embeddings import generate_text_embedding
  episode_text = f"{app_name} activity session"
  text_embedding = await generate_text_embedding(episode_text)
  
  # Update episode with embedding
  episodes_collection.update_one(
      {"episode_id": new_episode_id},
      {"$set": {"text_embedding": text_embedding}}
  )
  ```

- **Also in**: `/api/screenshot-upload` endpoint (line 145-371)
- **When**: Episode is created (line 276-286 or 297-307)
- **Add embedding generation there too**

### Point 2: Generate Embeddings When Creating Frames

**File**: `backend/main.py`
- **Endpoint**: `/api/screenshot-upload` (line 145-371)
- **When**: Frame document is created (line 312-327)
- **Add after line 327**:
  ```python
  # Generate text embedding for frame
  frame_text = f"{app_name} - {window_title or 'N/A'}"
  frame_text_embedding = await generate_text_embedding(frame_text)
  frame_doc["text_embedding"] = frame_text_embedding
  
  # Generate image embedding if blob_url exists
  if blob_url:
      frame_image_embedding = await generate_image_embedding(blob_url)
      frame_doc["image_embedding"] = frame_image_embedding
  ```

### Point 3: Replace Simple Context with Semantic Search

**File**: `backend/llm_runner.py`
- **Function**: `get_relevant_context()` (line 41-91)
- **Replace entire function** with semantic search version
- **Or create new function**: `get_relevant_context_semantic()` 
- **Update line 99** to call the new function:
  ```python
  # Line 99: Replace this
  context = await get_relevant_context(user_query)
  
  # With this
  context = await get_relevant_context_semantic(user_query)
  ```

## Where Embeddings Are Stored (MongoDB)

### Episodes Collection:
```python
{
    "episode_id": "uuid",
    "app_name": "Google Chrome",
    "text_embedding": [0.123, 0.456, ...],  # ADD THIS FIELD
    "frame_ids": [...],
    # ... other fields
}
```

### Frames Collection:
```python
{
    "frame_id": "uuid",
    "episode_id": "uuid",
    "app_name": "Google Chrome",
    "window_title": "GitHub - Pull Requests",
    "text_embedding": [0.123, 0.456, ...],  # ADD THIS FIELD
    "image_embedding": [0.789, 0.012, ...],  # ADD THIS FIELD (optional)
    "blob_url": "https://...",
    # ... other fields
}
```

## Quick Summary

### Current Context:
- **Location**: `llm_runner.py:41-91` (`get_relevant_context()`)
- **Method**: Time-based (recent episodes/frames)
- **Called from**: `llm_runner.py:99`
- **Added to**: System message at `llm_runner.py:103-114`

### Future Context (With Embeddings):
1. **Generate embeddings**: When creating episodes/frames in `main.py`
2. **Store embeddings**: In MongoDB documents (`text_embedding`, `image_embedding` fields)
3. **Retrieve context**: Replace `get_relevant_context()` with semantic search using vector search
4. **Use embeddings**: Query embedding → Vector search in MongoDB → Relevant context

### Files to Create/Modify:

1. **Create**: `backend/embeddings.py` - Embedding generation functions
2. **Modify**: `backend/main.py` - Add embedding generation when creating episodes/frames
3. **Modify**: `backend/llm_runner.py` - Replace context retrieval with semantic search
4. **Update**: MongoDB schema - Add embedding fields (already have structure, just need to populate)
5. **Create**: MongoDB Atlas Vector Search indexes (in Atlas UI)

