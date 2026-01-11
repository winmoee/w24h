# Technical Specifications for Embedding and Reranking System

## Embedding Models and Dimensions

### Text Embeddings (Episodes)
- **Model**: Voyage AI `voyage-2`
- **Embedding Dimensions**: 1024
- **Vector Type**: Dense floating-point vectors
- **Storage**: MongoDB Atlas (stored in `episodes.text_embedding` field)
- **Generation**: Automatic on episode closure
- **Source**: Generated from episode summaries (app name, duration, frame count, window titles)

### Image Embeddings (Frames)
- **Model**: Voyage AI `voyage-multimodal-3`
- **Embedding Dimensions**: 1536
- **Vector Type**: Dense floating-point vectors
- **Storage**: MongoDB Atlas (stored in `frames.image_embedding` field)
- **Generation**: Automatic on frame creation (when blob_url is available)
- **Source**: Generated from screenshot images via Vercel Blob URLs

## Reranking Configuration

### Reranker Model
- **Model**: Voyage AI `rerank-2`
- **Input**: Query string + list of document strings
- **Output**: Reranked documents with relevance scores (0.0 to 1.0)
- **Top-K**: Capped at 20 candidates for performance optimization
- **API Endpoint**: `https://api.voyageai.com/v1/rerank`

### Reranking Workflow
1. **Initial Retrieval**: Cosine similarity search on top 50 episodes
2. **Candidate Selection**: Top 20 candidates selected for reranking
3. **Reranking**: Voyage AI reranker processes query + candidates
4. **Final Results**: Top N results (default: 10) returned based on reranker scores

## Semantic Search Configuration

### Similarity Metric
- **Algorithm**: Cosine Similarity
- **Formula**: `cos(θ) = (A · B) / (||A|| × ||B||)`
- **Range**: -1.0 to 1.0 (typically 0.0 to 1.0 for normalized embeddings)
- **Implementation**: In-memory calculation for fast retrieval

### Query Processing
- **Query Embedding**: Generated using `voyage-2` model (1024 dimensions)
- **Episode Matching**: Cosine similarity between query embedding and episode embeddings
- **Frame Matching**: Cosine similarity between query embedding and frame embeddings
  - Note: Text-to-image similarity may have lower scores (different embedding spaces)

## Performance Optimizations

### Query Limits
- **Episodes**: Limited to 50 most recent (sorted by `start_ts` descending)
- **Frames**: Limited to 30 most recent (sorted by `ts` descending)
- **Reranking Candidates**: Capped at 20 to reduce API calls and latency

### MongoDB Optimizations
- **Projections**: Only fetch required fields (excludes large embedding vectors when not needed)
- **Indexes**: 
  - Episodes: `start_ts` (descending), `text_embedding` (exists)
  - Frames: `ts` (descending), `image_embedding` (exists), `blob_url` (exists)
- **Socket Timeout**: 20 seconds (increased from 10s for embedding queries)

### Error Handling
- **Graceful Degradation**: Falls back to similarity-based ranking if reranking fails
- **Frame Fetching**: Optional - errors don't break episode retrieval
- **Timeout Protection**: Queries are bounded to prevent indefinite hangs

## Database Schema

### Episodes Collection
- **text_embedding**: `number[]` (1024 dimensions) | `null`
- **summary**: `string` | `null` (auto-generated from episode metadata)

### Frames Collection
- **image_embedding**: `number[]` (1536 dimensions) | `null`
- **blob_url**: `string` | `null` (Vercel Blob URL for image access)

## API Configuration

### Voyage AI Endpoints
- **Text Embeddings**: `POST https://api.voyageai.com/v1/embeddings`
- **Image Embeddings**: `POST https://api.voyageai.com/v1/embeddings`
- **Reranking**: `POST https://api.voyageai.com/v1/rerank`

### Request Format
- **Text Embedding**: `{"input": [text], "model": "voyage-2"}`
- **Image Embedding**: `{"input": [image_url], "model": "voyage-multimodal-3"}`
- **Reranking**: `{"query": string, "documents": [string[]], "model": "rerank-2", "top_k": number}`

### Response Format
- **Embeddings**: `{"data": [{"embedding": number[]}]}`
- **Reranking**: `{"data": [{"index": number, "relevance_score": number}]}`

## Vector Storage

### Storage Strategy
- **Co-location**: Embeddings stored in same MongoDB documents as source data
- **Benefits**: 
  - Single query to retrieve data + embeddings
  - Native MongoDB Atlas Vector Search support
  - Atomic updates
  - No synchronization overhead

### Vector Size
- **Text Embeddings**: ~4KB per episode (1024 floats × 4 bytes)
- **Image Embeddings**: ~6KB per frame (1536 floats × 4 bytes)
- **Total Storage**: Well within MongoDB 16MB document limit

## Retrieval Pipeline

### Context Retrieval Flow
1. **Query Embedding Generation** (~100-200ms)
   - User query → Voyage AI `voyage-2` → 1024-dim vector
2. **Semantic Search** (~50-100ms)
   - Cosine similarity calculation on top 50 episodes
   - Cosine similarity calculation on top 30 frames
3. **Candidate Selection** (~10ms)
   - Top 20 episodes selected for reranking
4. **Reranking** (~200-500ms)
   - Voyage AI `rerank-2` processes query + candidates
5. **Context Formatting** (~10ms)
   - Results formatted with metadata and screenshot URLs
6. **Total Latency**: ~500-1000ms for typical queries

## Model Versions

- **voyage-2**: Latest text embedding model (1024 dimensions)
- **voyage-multimodal-3**: Latest multimodal embedding model (1536 dimensions)
- **rerank-2**: Latest reranking model

## Performance Metrics

### Throughput
- **Embedding Generation**: ~1 request/second (rate-limited)
- **Reranking**: ~2-5 requests/second (depending on candidate count)
- **Query Processing**: ~1-2 queries/second (end-to-end)

### Latency
- **Text Embedding**: 100-200ms
- **Image Embedding**: 200-400ms
- **Reranking**: 200-500ms (for 20 candidates)
- **Total Context Retrieval**: 500-1000ms

### Accuracy
- **Semantic Search**: Cosine similarity scores typically 0.65-0.75 for relevant matches
- **Reranking**: Relevance scores typically 0.25-0.50 (reranker-specific scale)
- **Order Changes**: Reranker consistently reorders results for improved relevance

