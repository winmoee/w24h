# Performance Optimizations for Reranking

## Issues Identified

1. **MongoDB Timeout**: Queries were timing out when fetching frames with embeddings
2. **Large Document Fetching**: Loading entire documents including large embedding vectors
3. **No Query Limits**: Fetching all frames/episodes without limits
4. **Inefficient Projections**: Not using MongoDB projections to exclude unnecessary fields

## Optimizations Applied

### 1. Episode Query Optimization

**Before:**
```python
episodes_with_embeddings = list(episodes_collection.find({
    "text_embedding": {"$exists": True, "$ne": None}
}))
```

**After:**
```python
episodes_with_embeddings = list(episodes_collection.find(
    {"text_embedding": {"$exists": True, "$ne": None}},
    {
        "text_embedding": 1,
        "episode_id": 1,
        "app_name": 1,
        "summary": 1,
        "frame_count": 1,
        "start_ts": 1,
        "end_ts": 1
    }
).sort("start_ts", -1).limit(50))
```

**Benefits:**
- Uses projection to only fetch needed fields
- Limits to 50 most recent episodes
- Sorts by timestamp to get most relevant recent episodes first

### 2. Frame Query Optimization

**Before:**
```python
frames_with_embeddings = list(frames_collection.find({
    "image_embedding": {"$exists": True, "$ne": None},
    "blob_url": {"$exists": True, "$ne": None}
}))
```

**After:**
```python
frames_with_embeddings = list(frames_collection.find(
    {
        "image_embedding": {"$exists": True, "$ne": None},
        "blob_url": {"$exists": True, "$ne": None}
    },
    {
        "image_embedding": 1,
        "frame_id": 1,
        "app_name": 1,
        "window_title": 1,
        "ts": 1,
        "blob_url": 1
    }
).sort("ts", -1).limit(30))
```

**Benefits:**
- Uses projection to exclude unnecessary fields
- Limits to 30 most recent frames
- Wrapped in try-catch to gracefully handle errors
- Sorts by timestamp for relevance

### 3. Reranking Optimization

**Before:**
```python
top_episodes = episode_scores[:limit * 2]  # Get 2x for reranking
```

**After:**
```python
rerank_candidates = min(limit * 2, 20)  # Cap at 20 to avoid reranking too many
top_episodes = episode_scores[:rerank_candidates]
```

**Benefits:**
- Caps reranking candidates at 20 (prevents excessive API calls)
- Still allows 2x limit for smaller datasets

### 4. MongoDB Timeout Increase

**Before:**
```python
socketTimeoutMS=10000,  # 10 seconds
```

**After:**
```python
socketTimeoutMS=30000,  # 30 seconds for queries with embeddings
```

**Benefits:**
- Gives more time for queries that need to fetch embedding vectors
- Still reasonable timeout to avoid hanging

### 5. Error Handling

- Added try-catch around frame fetching
- Gracefully skips frames if there's an error (episodes are more important)
- Reranking falls back to similarity-based ranking if it fails

## Performance Impact

### Before Optimizations
- **Episodes**: Fetched all episodes with embeddings (could be hundreds)
- **Frames**: Fetched all frames with embeddings (could be thousands)
- **Timeout Risk**: High - queries could timeout with large datasets
- **Memory Usage**: High - loading large embedding vectors unnecessarily

### After Optimizations
- **Episodes**: Limited to 50 most recent
- **Frames**: Limited to 30 most recent
- **Timeout Risk**: Low - queries are bounded and faster
- **Memory Usage**: Reduced - only fetch needed fields
- **Reranking**: Capped at 20 candidates

## Expected Improvements

1. **Query Speed**: 5-10x faster (depending on dataset size)
2. **Timeout Reduction**: Should eliminate timeouts for typical datasets
3. **Memory Usage**: Significantly reduced
4. **API Costs**: Reduced reranking API calls (capped at 20)

## Recommendations

1. ✅ Optimizations applied and tested
2. Monitor performance as dataset grows
3. Consider increasing limits if needed (but keep them bounded)
4. May want to add caching for frequently accessed queries
5. Consider pagination for very large datasets

## Notes

- Limits are conservative to ensure reliability
- Can be adjusted based on actual usage patterns
- Frame fetching is optional (episodes are primary context)
- Error handling ensures system continues working even if frames fail

