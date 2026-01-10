# Codebase Analysis and Progress Report

## Overview

This system is a multimodal activity tracking and chat assistant that captures computer screenshots, groups them into episodes by application, and provides an LLM-powered chat interface to query and understand user activity patterns.

## Architecture

### System Components

1. **Electron App** (`screenshot-app-electron-master/`): Captures screenshots and app activity data
2. **FastAPI Backend** (`backend/`): Receives screenshots, stores data in MongoDB, provides chat API
3. **MongoDB Atlas**: Stores frames (screenshots) and episodes (grouped activity sessions)
4. **Vercel Blob**: Stores screenshot image files
5. **Thesys C1 API**: Provides LLM chat capabilities via Claude Sonnet 4

### Data Flow

1. Electron app captures screenshots every minute
2. Screenshots uploaded to Vercel Blob via `/api/screenshot-upload`
3. Frame documents created in MongoDB `frames` collection
4. Episodes automatically created/updated based on app name changes
5. Chat interface queries MongoDB for context via `llm_runner.py`

## Database Schema

### Frames Collection

Frames represent individual screenshots captured by the Electron app.

**Key Fields:**
- `frame_id`: Unique UUID identifier
- `episode_id`: Links frame to parent episode
- `ts`: Timestamp in milliseconds when screenshot was taken
- `app_name`: Application name when screenshot was captured
- `window_title`: Window title (optional)
- `screenshot_path`: Local file path
- `blob_url`: Vercel Blob URL for the image
- `blob_pathname`: Pathname in blob storage
- `file_size`: Image file size in bytes
- `content_type`: MIME type (typically 'image/png')
- `created_at`: Document creation timestamp

**Indexes:**
- `episode_id` (for linking frames to episodes)
- `ts` (descending, for time-based queries)
- `app_name` (for filtering by application)

### Episodes Collection

Episodes group frames together when the user is working in the same application. A new episode starts automatically when the app name changes.

**Key Fields:**
- `episode_id`: Unique UUID identifier
- `app_name`: The application this episode represents
- `frame_ids`: Array of frame UUIDs belonging to this episode
- `start_ts`: Timestamp when episode started (first frame)
- `end_ts`: Timestamp when episode ended (null if still active)
- `frame_count`: Number of frames in this episode
- `created_at`: Document creation timestamp
- `updated_at`: Last update timestamp

**Indexes:**
- `episode_id` (unique, for lookups)
- `app_name` (for filtering by application)
- `start_ts` (descending, for recent episodes)
- `end_ts` (for finding active episodes)

**Episode Logic:**
- When a screenshot is captured, the system checks if `app_name` matches the current episode's `app_name`
- If same: Frame is added to existing episode (updates `frame_ids`, `frame_count`, `end_ts`)
- If different: Previous episode is closed (sets `end_ts`), new episode is created

## LLM Runner Context Retrieval

### Current Implementation

The `get_relevant_context()` function in `llm_runner.py` retrieves context from MongoDB to provide the LLM with information about recent user activity.

**Retrieval Strategy:**

1. **Recent Episodes**: Fetches the 5 most recent episodes sorted by `start_ts` (descending)
   - Extracts: app name, frame count, start timestamp
   - Formats as human-readable date/time strings

2. **Recent Frames**: Fetches the 10 most recent frames sorted by `ts` (descending)
   - Extracts: app name, window title, timestamp
   - Formats as human-readable date/time strings

**Context Format:**
- Episode information shows which apps were used and for how long (based on frame count)
- Frame information shows specific screenshots with window titles
- All timestamps converted to readable format (YYYY-MM-DD HH:MM:SS)

**Integration with Chat:**
- Context is retrieved when a user sends a message
- If this is the first message in a conversation, context is added as a system message
- System message explains the data structure (frames = screenshots, episodes = grouped by app)
- Context persists in conversation history via thread store

**Limitations:**
- Currently uses simple time-based sorting (most recent first)
- No semantic search or filtering based on query content
- Fixed limits (5 episodes, 10 frames)
- No filtering by date range, app name, or other criteria
- Does not use embeddings for relevance matching

### Error Handling

- Gracefully handles MongoDB unavailability (returns error message)
- Catches and logs exceptions without breaking the chat flow
- Returns fallback messages if database operations fail

## Progress Summary

### Completed Features

✅ **Data Collection**
- Screenshot capture via Electron app
- Automatic episode grouping by app name
- MongoDB storage with proper indexes
- Vercel Blob integration for image storage

✅ **Backend Infrastructure**
- FastAPI server with CORS support
- MongoDB connection with retry logic
- Thread-based conversation storage
- Error handling and graceful degradation

✅ **Chat Interface**
- LLM integration via Thesys C1 API
- Streaming responses
- Context retrieval from MongoDB
- Conversation history management

### Areas for Enhancement

🔧 **Context Retrieval**
- Currently uses simple time-based queries
- Could implement semantic search using embeddings
- Could filter by query relevance (e.g., "show me Chrome activity")
- Could support date range queries
- Could aggregate statistics (total time per app, etc.)

🔧 **Episode Schema**
- Current schema is minimal (app_name, timestamps, frame_ids)
- Could add: title, summary_text, tags (as in the TypeScript version)
- Could add: text_embedding for semantic search
- Could add: user annotations or notes

🔧 **Frame Schema**
- Current schema has basic metadata
- Could add: image_embedding for visual search
- Could add: caption or OCR text
- Could add: activity classification

🔧 **Query Capabilities**
- No vector search implementation yet
- No filtering by app, date, or other criteria
- No aggregation queries (statistics, summaries)
- No image-based queries

## Technical Notes

### MongoDB Connection
- Uses PyMongo driver
- Automatic index creation on startup
- Connection pooling and retry logic
- Graceful fallback when database unavailable

### Thread Store
- In-memory storage of conversation history
- Messages stored with OpenAI-compatible format
- Supports system, user, and assistant messages
- Thread-based isolation (each conversation has unique thread ID)

### Context Injection
- Context only added on first message of conversation
- System message format explains data structure to LLM
- Context includes both episode and frame information
- Timestamps formatted for human readability

## Future Directions

1. **Semantic Search**: Use embeddings to find relevant episodes/frames based on query meaning
2. **Rich Episodes**: Add title, summary, tags to episodes for better context
3. **Visual Search**: Use image embeddings to find similar screenshots
4. **Query Filters**: Support filtering by app, date range, window title
5. **Statistics**: Aggregate queries (e.g., "how much time did I spend in VS Code?")
6. **Reranking**: Improve relevance of retrieved context
7. **Clarifying Questions**: LLM asks for clarification when queries are ambiguous

