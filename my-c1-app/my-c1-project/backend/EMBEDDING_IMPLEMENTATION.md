# Embedding Implementation Summary

## Overview

This document describes the implementation of automatic embedding generation for frames and episodes using Voyage AI.

## Schema Changes

### Frames Collection
Added new field:
- `image_embedding` (number[] | null): Vector embedding from Voyage AI (typically 1024 dimensions)

### Episodes Collection
Added new fields:
- `summary` (string | null): Auto-generated text summary of the episode
- `text_embedding` (number[] | null): Vector embedding from Voyage AI (typically 1024 dimensions)

## Implementation Details

### Voyage AI Client (`voyage.py`)

Created a new module with three main functions:

1. **`embed_text(text: str, model: Optional[str] = None)`**
   - Generates text embeddings using Voyage AI
   - Default model: `voyage-2`
   - Returns: List of floats (embedding vector)

2. **`embed_image(image_url: str, model: Optional[str] = None)`**
   - Generates image embeddings using Voyage AI multimodal endpoint
   - Default model: `voyage-multimodal-3`
   - Returns: List of floats (embedding vector)

3. **`generate_episode_summary(...)`**
   - Generates a simple text summary for an episode
   - Includes: app name, duration, frame count, window titles
   - Returns: Summary string

### Automatic Embedding Generation

#### Frame Embeddings
- **Trigger**: When a new frame is created via `/api/screenshot-upload`
- **Condition**: Only if `blob_url` is available (image uploaded to Vercel Blob)
- **Process**: 
  1. Frame document is created in MongoDB
  2. Background task is spawned to generate image embedding
  3. Embedding is stored in `image_embedding` field
- **Async**: Runs in background, doesn't block the API response

#### Episode Embeddings and Summaries
- **Trigger**: When an episode is closed (app name changes)
- **Locations**:
  - `/api/screenshot-upload` - when app_name changes
  - `/api/activity` - when app_name changes
- **Process**:
  1. Episode `end_ts` is set
  2. Background task is spawned to:
     - Fetch episode data and associated frames
     - Extract window titles from frames
     - Generate text summary
     - Generate text embedding from summary
     - Store both `summary` and `text_embedding` in episode document
- **Async**: Runs in background, doesn't block the API response

## Environment Variables

Required:
- `VOYAGE_API_KEY`: Voyage AI API key

Optional:
- `VOYAGE_TEXT_MODEL`: Text embedding model (default: `voyage-2`)
- `VOYAGE_IMAGE_MODEL`: Image embedding model (default: `voyage-multimodal-3`)

## Error Handling

- Embedding generation errors are logged but don't break the main flow
- If Voyage AI API is unavailable, frames/episodes are still stored (just without embeddings)
- Errors are logged with `[EMBEDDING]` prefix for easy debugging

## Usage Notes

1. **Initial State**: Existing frames/episodes will not have embeddings until they are updated
2. **Background Processing**: Embeddings are generated asynchronously, so there may be a delay
3. **API Key**: Make sure `VOYAGE_API_KEY` is set in your `.env` file
4. **Blob URL Required**: Frame embeddings require successful upload to Vercel Blob

## Next Steps

1. **Vector Search**: Implement semantic search using the stored embeddings
2. **Batch Processing**: Create endpoint to generate embeddings for existing frames/episodes
3. **Monitoring**: Add metrics to track embedding generation success/failure rates
4. **Retry Logic**: Add retry mechanism for failed embedding generations

