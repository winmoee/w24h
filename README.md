# w24h - Multimodal Handoff System

Work 24 Hours - A context engine for human work episodes with semantic search capabilities.

## Overview

This backend system stores structured work episodes (with timestamps, tags, notes, and screenshots) and provides semantic search capabilities using MongoDB Atlas Vector Search and Voyage AI embeddings.

### MVP Step 1 Features

- ✅ Episode creation with automatic text embeddings
- ✅ Frame (screenshot) creation and linking to episodes
- ✅ Natural language query endpoint using vector search
- ✅ MongoDB Atlas integration with vector search support

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express
- **Database**: MongoDB Atlas (official Node.js driver)
- **Validation**: Zod
- **Embeddings**: Voyage AI
- **Storage**: S3 (stubbed for MVP Step 1)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required

- `MONGODB_URI` - MongoDB Atlas connection string
  - Example: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`
  - Get your connection string from MongoDB Atlas → Connect → Connect your application
- `MONGODB_DB` - Database name (default: `w24h`)
- `VOYAGE_API_KEY` - Voyage AI API key for embeddings

### Optional

- `PORT` - Server port (default: `3000`)
- `VOYAGE_TEXT_MODEL` - Voyage text embedding model (default: `voyage-2`)
- `VOYAGE_IMAGE_MODEL` - Voyage image embedding model (default: `voyage-large-2`)

See `.env.example` for a template (if available).

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file in the root directory with the required variables (see above).
   
   Example `.env` file:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=w24h
   VOYAGE_API_KEY=your-voyage-api-key
   PORT=3000
   ```

3. **Configure MongoDB Atlas**:
   - Ensure your MongoDB Atlas cluster is running (not paused)
   - Add your IP address to the IP Access List in MongoDB Atlas
     - Go to Network Access → Add IP Address
     - For development, you can temporarily use `0.0.0.0/0` (allows all IPs - less secure)
   - Verify your database user credentials in Database Access

4. **Set up MongoDB Atlas Vector Search**:
   - Create a vector search index in MongoDB Atlas UI
   - Index name: `vector_search_text_embedding`
   - Indexed field: `episodes.text_embedding`
   - Dimensions: 1024 (for voyage-2 model)
   - Similarity: cosine

5. **Build the project**:
   ```bash
   npm run build
   ```

6. **Run the server**:
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## API Endpoints

### Health Check

- `GET /health` - Server health status

### Episodes

- `POST /api/episodes` - Create a new episode
  - Request body: See `CreateEpisodeSchema` in `src/types.ts`
  - Automatically generates text embedding from title + summary_text
  - Returns: `{ episode_id, message }`

- `GET /api/episodes/:episode_id` - Get episode by ID
  - Returns: Episode document (without embedding vector)

### Frames

- `POST /api/frames` - Create a new frame (screenshot)
  - Request body: See `CreateFrameSchema` in `src/types.ts`
  - Requires either `s3_key` or `url`
  - Automatically links frame to episode
  - Returns: `{ frame_id, message }`

- `GET /api/frames/:frame_id` - Get frame by ID
  - Returns: Frame document (without embedding vector)

### Query

- `POST /api/query` - Query episodes using natural language
  - Request body: `{ query: string, limit?: number, min_score?: number }`
  - Uses vector search to find semantically similar episodes
  - Returns: `{ query, results: Episode[], count }`

## Database Schema

### Episodes Collection

```typescript
{
  _id: ObjectId,
  episode_id: string (UUID),
  start_ts: number (milliseconds),
  end_ts: number (milliseconds),
  title: string,
  summary_text: string,
  tags: {
    project?: string,
    app?: string,
    url?: string,
    branch?: string,
    error_keywords?: string[]
  },
  frame_ids: string[] (UUIDs),
  text_embedding: number[] | null,
  created_at: Date,
  updated_at: Date
}
```

### Frames Collection

```typescript
{
  _id: ObjectId,
  frame_id: string (UUID),
  episode_id: string (UUID),
  ts: number (milliseconds),
  s3_key?: string,
  url?: string,
  caption?: string,
  image_embedding: number[] | null,
  created_at: Date,
  updated_at: Date
}
```

## Project Structure

```
src/
  ├── index.ts          # Entry point
  ├── app.ts            # Express app setup
  ├── db.ts             # MongoDB connection
  ├── voyage.ts         # Voyage AI embedding client
  ├── types.ts          # TypeScript types and Zod schemas
  └── routes/
      ├── episodes.ts   # Episode endpoints
      ├── frames.ts     # Frame endpoints
      └── query.ts      # Query endpoint
```

## Development

- `npm run build` - Compile TypeScript
- `npm run dev` - Run with auto-reload
- `npm run type-check` - Type check without building
- `npm start` - Run production build

## MongoDB Connection

### Quick Connection Guide

1. **Get your MongoDB Atlas connection string**:
   - Go to [MongoDB Atlas](https://cloud.mongodb.com)
   - Navigate to your cluster → Click "Connect" → "Connect your application"
   - Copy the connection string (format: `mongodb+srv://username:password@cluster.mongodb.net/`)

2. **Create `.env` file** in the project root:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=w24h
   VOYAGE_API_KEY=your-voyage-api-key
   ```

3. **Configure MongoDB Atlas**:
   - Ensure your cluster is **running** (not paused)
   - Add your IP address to **Network Access** → IP Access List
   - Verify your database user has proper permissions

4. **Test the connection**:
   ```bash
   npm run build
   npm start
   ```
   The server will connect automatically on startup.

### DNS Configuration

The application uses Google DNS (8.8.8.8, 8.8.4.4, 1.1.1.1) by default to resolve MongoDB SRV records. This helps avoid DNS resolution issues that can occur with some system DNS configurations. The DNS configuration is automatically set in `src/db.ts`.

### Troubleshooting Connection Issues

If you encounter connection errors:

1. **DNS Resolution Errors**: The app automatically uses Google DNS. If issues persist:
   - Verify your internet connection
   - Check if MongoDB Atlas cluster is running (not paused)
   - Verify the cluster hostname in your connection string

2. **Connection Timeout**: 
   - Check MongoDB Atlas IP Access List - your IP must be whitelisted
   - Verify your username and password in the connection string
   - Ensure the cluster is not paused (free tier clusters pause after inactivity)

3. **Authentication Failed**:
   - Verify database user credentials in MongoDB Atlas
   - Check that the username and password in `MONGODB_URI` are correct
   - Ensure the database user has appropriate permissions

## Notes

- Image embeddings are stubbed for MVP Step 1 (will throw "not implemented yet")
- Vector search requires a properly configured index in MongoDB Atlas
- The system falls back to text search if vector search is unavailable
- UUIDs are auto-generated if not provided in requests
- The application uses Google DNS for reliable MongoDB SRV record resolution

## Future Enhancements (Post-MVP)

- Image embedding support
- Reranking with task-aware heuristics
- Clarifying question generation
- Handoff brief generation
- Feedback loop for retrieval improvement
