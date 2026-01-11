# w24h - Multimodal Handoff System

Work 24 Hours - A context engine for human work episodes with semantic search capabilities.

## Overview

This system captures computer screenshots and activity data, structures them into meaningful "episodes," and makes them retrievable through an AI-powered chat interface. It provides multimodal work memory that helps users understand their past activity and context.

### Key Features

- ✅ Automatic screenshot capture every minute via Electron app
- ✅ Episode creation with automatic grouping by application
- ✅ Automatic text and image embeddings using Voyage AI
- ✅ Semantic search with reranking for relevant context retrieval
- ✅ AI chat interface that displays relevant screenshots inline
- ✅ MongoDB Atlas integration for data storage

## Architecture

The system consists of three main components:

1. **Electron App** (`screenshot-app-electron-master/`): Desktop application that captures screenshots and activity data
2. **FastAPI Backend** (`my-c1-app/my-c1-project/backend/`): Python backend that receives screenshots, stores data in MongoDB, and provides chat API
3. **Next.js Frontend** (`my-c1-app/src/`): Web interface with chat capabilities

### Data Flow

1. Electron app captures screenshots every minute
2. Screenshots uploaded to Vercel Blob via `/api/screenshot-upload`
3. Frame documents created in MongoDB `frames` collection
4. Episodes automatically created/updated based on app name changes
5. Embeddings automatically generated for frames (images) and episodes (text summaries)
6. Chat interface queries MongoDB for context via semantic search and reranking

## Tech Stack

### Backend
- **Runtime**: Python 3.12+
- **Framework**: FastAPI
- **Database**: MongoDB Atlas (PyMongo driver)
- **Embeddings**: Voyage AI (`voyage-2` for text, `voyage-multimodal-3` for images)
- **Reranking**: Voyage AI `rerank-2`
- **LLM**: Claude Sonnet 4 via Thesys C1 API
- **Storage**: Vercel Blob (screenshots)

### Frontend
- **Framework**: Next.js 15
- **UI**: React 19 with Thesys C1 SDK
- **Language**: TypeScript

### Desktop App
- **Framework**: Electron
- **Language**: JavaScript/Node.js

## Environment Variables

Create a `.env` file in `my-c1-app/` with the following variables:

### Required

- `MONGODB_URI` - MongoDB Atlas connection string
  - Example: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`
- `MONGODB_DB` - Database name (default: `w24h`)
- `VOYAGE_API_KEY` - Voyage AI API key for embeddings
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage token

### Optional

- `VOYAGE_TEXT_MODEL` - Voyage text embedding model (default: `voyage-2`)
- `VOYAGE_IMAGE_MODEL` - Voyage image embedding model (default: `voyage-multimodal-3`)
- `VOYAGE_RERANK_MODEL` - Voyage reranking model (default: `rerank-2`)

## Setup

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd my-c1-app/my-c1-project/backend
   ```

2. **Create virtual environment** (recommended):
   ```bash
   python3 -m venv myenv
   source myenv/bin/activate  # On Windows: myenv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   Create a `.env` file in `my-c1-app/` with the required variables (see above).

5. **Run the server**:
   ```bash
   uvicorn main:app --reload
   ```

   The server will be available at http://localhost:8000

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd my-c1-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

   The frontend will be available at http://localhost:3000

### Electron App Setup

1. **Navigate to Electron app directory**:
   ```bash
   cd screenshot-app-electron-master
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure backend URL**:
   Update the server URL in the app configuration to point to your backend.

4. **Run the app**:
   ```bash
   npm start
   ```

## Database Schema

### Frames Collection

Frames represent individual screenshots captured by the Electron app.

```javascript
{
  _id: ObjectId,
  frame_id: string (UUID),
  episode_id: string (UUID),  // Links to episode
  ts: number (milliseconds timestamp),
  app_name: string,
  window_title: string (optional),
  screenshot_path: string,
  blob_url: string (optional),  // Vercel Blob URL
  blob_pathname: string (optional),
  file_size: number,
  content_type: string,
  image_embedding: number[] (optional),  // 1536 dimensions (voyage-multimodal-3)
  created_at: Date
}
```

### Episodes Collection

Episodes group frames together when the user is working in the same application. A new episode starts automatically when the app name changes.

```javascript
{
  _id: ObjectId,
  episode_id: string (UUID),
  app_name: string,
  frame_ids: string[],  // Array of frame_id UUIDs
  start_ts: number (milliseconds),
  end_ts: number (milliseconds, nullable),
  frame_count: number,
  summary: string (optional),  // Auto-generated text summary
  text_embedding: number[] (optional),  // 1024 dimensions (voyage-2)
  created_at: Date,
  updated_at: Date
}
```

## API Endpoints

### Backend (FastAPI)

- `GET /` - Health check
- `POST /api/screenshot-upload` - Upload screenshot and create frame
- `POST /api/activity` - Receive activity data from Electron app
- `POST /chat` - Chat endpoint with semantic search context retrieval

### Frontend (Next.js)

- `POST /api/chat` - Chat API route
- `POST /api/screenshot-upload` - Screenshot upload route
- `GET /api/screenshots` - List screenshots
- `GET /api/screenshots/metadata` - Get screenshot metadata

## Semantic Search & Retrieval

The system uses a two-stage retrieval process:

1. **Initial Retrieval**: Cosine similarity search across top 50 most recent episodes and top 30 most recent frames
2. **Reranking**: Voyage AI `rerank-2` model processes top 20 candidates to improve relevance
3. **Context Assembly**: Relevant episodes (with summaries, timestamps, app names) and screenshots (with URLs) are formatted for the LLM

### Technical Specifications

- **Text Embeddings**: Voyage AI `voyage-2` (1024 dimensions)
- **Image Embeddings**: Voyage AI `voyage-multimodal-3` (1536 dimensions)
- **Reranker**: Voyage AI `rerank-2`
- **Similarity Metric**: Cosine similarity (in-memory calculation)
- **Query Performance**: ~500-1000ms end-to-end

## Project Structure

```
w24h/
├── my-c1-app/
│   ├── my-c1-project/
│   │   └── backend/          # Python FastAPI backend
│   │       ├── main.py       # FastAPI app and endpoints
│   │       ├── llm_runner.py  # LLM chat logic with semantic search
│   │       ├── db.py         # MongoDB connection
│   │       ├── voyage.py     # Voyage AI embedding client
│   │       └── ...
│   └── src/                  # Next.js frontend
│       └── app/
│           └── api/           # API routes
├── screenshot-app-electron-master/  # Electron desktop app
│   └── src/
│       ├── capture.js        # Screenshot capture
│       └── activityTracker.js  # Activity tracking
└── README.md
```

## Development

### Backend Development

```bash
cd my-c1-app/my-c1-project/backend
source myenv/bin/activate  # Activate virtual environment
uvicorn main:app --reload   # Run with auto-reload
```

### Frontend Development

```bash
cd my-c1-app
npm run dev  # Run Next.js dev server
```

### Batch Processing

To generate embeddings for existing frames and episodes:

```bash
cd my-c1-app/my-c1-project/backend
python batch_embed.py
```

## MongoDB Connection

### Quick Setup

1. **Get your MongoDB Atlas connection string**:
   - Go to [MongoDB Atlas](https://cloud.mongodb.com)
   - Navigate to your cluster → Click "Connect" → "Connect your application"
   - Copy the connection string

2. **Add to `.env` file**:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=w24h
   ```

3. **Configure MongoDB Atlas**:
   - Ensure your cluster is running (not paused)
   - Add your IP address to Network Access → IP Access List
   - Verify your database user has proper permissions

### Indexes

The system automatically creates the following indexes:
- `frames.episode_id` (ascending)
- `frames.ts` (descending)
- `frames.app_name` (ascending)
- `episodes.episode_id` (unique)
- `episodes.app_name` (ascending)
- `episodes.start_ts` (descending)

## Notes

- Screenshots are stored in Vercel Blob and automatically synced to MongoDB
- Image embeddings are automatically generated when frames are uploaded (if blob_url is available)
- Text embeddings and summaries are automatically generated when episodes are closed
- The chat interface displays relevant screenshots inline using markdown image syntax
- All embeddings are co-located with source data in MongoDB (no separate vector database needed)

## Documentation

- `my-c1-app/my-c1-project/backend/PROJECT_DESCRIPTION.md` - Project overview
- `my-c1-app/my-c1-project/backend/TECHNICAL_SPECIFICATIONS.md` - Technical details
- `my-c1-app/my-c1-project/backend/EMBEDDING_IMPLEMENTATION.md` - Embedding system details
- `my-c1-app/my-c1-project/backend/SEMANTIC_SEARCH_IMPLEMENTATION.md` - Search implementation
