# MongoDB Setup Guide

## Overview

The backend now uses MongoDB (instead of SQL) with a simplified schema:
- **Frames**: One document per screenshot
- **Episodes**: Groups frames by app_name (new episode when app_name changes)

## MongoDB Connection

The connection follows your friend's TypeScript pattern from `/w24h/src/db.ts`:

### Environment Variables

Add these to `.env` in `my-c1-app/`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=w24h
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token
```

### Connection Code

The MongoDB connection is in `backend/db.py`:
- Uses `pymongo` for Python MongoDB driver
- Follows same pattern as TypeScript version
- Automatically creates indexes on startup
- Handles connection pooling and reconnection

## Collections

### 1. `frames` Collection

One document per screenshot:

```python
{
    "frame_id": "uuid-string",
    "episode_id": "uuid-string",  # Links to episode
    "ts": 1234567890000,  # Unix timestamp in milliseconds
    "app_name": "Google Chrome",
    "window_title": "GitHub - Pull Requests",
    "screenshot_path": "/Users/.../Screenshots/screenshot_2024-01-01_12-00-00.png",
    "blob_url": "https://...vercel-storage.com/...",  # Optional, if uploaded
    "blob_pathname": "screenshots/...",
    "file_size": 524288,  # bytes
    "content_type": "image/png",
    "created_at": ISODate("2024-01-01T12:00:00Z")
}
```

**Indexes:**
- `episode_id` (ascending)
- `ts` (descending)
- `app_name` (ascending)

### 2. `episodes` Collection

Groups frames by app_name. New episode starts when app_name changes:

```python
{
    "episode_id": "uuid-string",
    "app_name": "Google Chrome",
    "frame_ids": ["frame-uuid-1", "frame-uuid-2", ...],  # Array of frame IDs
    "start_ts": 1234567890000,  # When episode started (first frame)
    "end_ts": 1234567895000,  # When episode ended (last frame or app change), null if active
    "frame_count": 5,  # Number of frames in this episode
    "created_at": ISODate("2024-01-01T12:00:00Z"),
    "updated_at": ISODate("2024-01-01T12:05:00Z")
}
```

**Indexes:**
- `episode_id` (unique, ascending)
- `app_name` (ascending)
- `start_ts` (descending)
- `end_ts` (ascending)

**Logic:**
- When screenshot is taken, check if `app_name` matches current episode's `app_name`
- If **same**: Add frame to existing episode (update `frame_ids`, `frame_count`, `end_ts`)
- If **different**: Close previous episode (set `end_ts`), create new episode

## API Endpoints

### 1. `POST /api/screenshot-upload`

Uploads screenshot to Vercel Blob and stores frame in MongoDB.

**Form Data:**
- `file`: Image file (required)
- `pathname`: Optional pathname for blob storage
- `app_name`: Application name (for episode tracking)
- `window_title`: Window title (optional)
- `local_path`: Local file path (optional)

**Response:**
```json
{
    "success": true,
    "frame_id": "uuid",
    "episode_id": "uuid",
    "url": "https://...vercel-storage.com/...",
    "pathname": "screenshots/...",
    "contentType": "image/png"
}
```

**Behavior:**
- Uploads screenshot to Vercel Blob
- Creates frame document in `frames` collection
- Creates/updates episode based on `app_name`
- Links frame to episode

### 2. `POST /api/activity`

Receives app_name changes for episode tracking.

**Request Body:**
```json
{
    "appName": "Google Chrome",
    "windowTitle": "GitHub - Pull Requests"  // optional
}
```

**Response:**
```json
{
    "status": "success",
    "app_name": "Google Chrome",
    "episode_id": "uuid"
}
```

**Behavior:**
- Checks if `app_name` changed
- If changed: closes previous episode, creates new episode
- Returns current episode_id

## Example Workflow

1. **User takes screenshot in Chrome**
   - Electron app captures screenshot
   - Gets app_name: "Google Chrome"
   - Sends to `/api/screenshot-upload` with app_name
   - Backend creates episode for "Google Chrome" (if first time)
   - Creates frame document, links to episode

2. **User switches to VS Code**
   - Activity tracker detects app change
   - Sends to `/api/activity` with app_name: "Visual Studio Code"
   - Backend closes Chrome episode, creates VS Code episode

3. **User takes screenshot in VS Code**
   - Screenshot sent with app_name: "Visual Studio Code"
   - Backend adds frame to existing VS Code episode

4. **User switches back to Chrome**
   - Activity tracker sends app change
   - Backend closes VS Code episode, creates new Chrome episode

## Querying Data

### Get all frames for an episode:

```python
from db import get_frames_collection

frames_collection = get_frames_collection()
frames = list(frames_collection.find({"episode_id": "episode-uuid"}).sort("ts", 1))
```

### Get all episodes for an app:

```python
from db import get_episodes_collection

episodes_collection = get_episodes_collection()
episodes = list(episodes_collection.find({"app_name": "Google Chrome"}).sort("start_ts", -1))
```

### Get active episode (no end_ts):

```python
from db import get_episodes_collection

episodes_collection = get_episodes_collection()
active_episodes = list(episodes_collection.find({"end_ts": None}).sort("start_ts", -1))
```

## Testing

1. **Start MongoDB** (local or Atlas)
2. **Start Python backend:**
   ```bash
   cd my-c1-app/my-c1-project/backend
   source ../../myenv/bin/activate
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Start Electron app:**
   ```bash
   cd screenshot-app-electron-master
   npm start
   ```

4. **Check MongoDB:**
   ```bash
   mongosh "mongodb+srv://..."
   use w24h
   db.frames.find().limit(5)
   db.episodes.find().limit(5)
   ```

## Notes

- Episodes are created automatically based on app_name changes
- Frames are always linked to an episode (even if "Unknown" app)
- Episode `end_ts` is updated with each new frame (episode continues)
- Episode `end_ts` is set when app_name changes (episode ends)
- Global variables `last_app_name` and `current_episode_id` are used for tracking (in production, use Redis or database)

