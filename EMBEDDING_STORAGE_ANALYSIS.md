# Embedding Storage Analysis

## Current Schema Breakdown

### 📸 Frames Collection

**Data from Vercel Blob:**
- `url` (string, required) - Vercel Blob URL pointing to the screenshot image
- `caption` (string, optional) - Optional caption/description

**Metadata (generated/synced):**
- `frame_id` (UUID) - Unique identifier
- `episode_id` (UUID) - Link to parent episode
- `ts` (number) - Timestamp in milliseconds
- `created_at` (Date) - Document creation time
- `updated_at` (Date) - Last update time

**Embedding Field:**
- `image_embedding` (number[] | null) - Vector embedding from Voyage AI
  - Dimensions: Varies by model (voyage-multimodal-3 typically 1024 dimensions)
  - Type: Array of floating-point numbers
  - Nullable: Yes (can be null if embedding not yet generated)

### 📄 Episodes Collection

**Data from Blob/User Input:**
- `title` (string) - Episode title
- `summary_text` (string) - Episode summary/description
- `tags` (object) - Metadata tags (project, app, url, branch, error_keywords)
- `start_ts` (number) - Start timestamp in milliseconds
- `end_ts` (number) - End timestamp in milliseconds

**Metadata (generated/synced):**
- `episode_id` (UUID) - Unique identifier
- `frame_ids` (UUID[]) - Array of linked frame IDs
- `created_at` (Date) - Document creation time
- `updated_at` (Date) - Last update time

**Embedding Field:**
- `text_embedding` (number[] | null) - Vector embedding from Voyage AI
  - Dimensions: 1024 (for voyage-2 model)
  - Type: Array of floating-point numbers
  - Nullable: Yes (can be null if embedding not yet generated)
  - Source: Generated from `title + "\n\n" + summary_text`

## Current Implementation: Embeddings in Same Document

### ✅ Current Approach
Embeddings are stored **directly in MongoDB Atlas** in the same document as the source data:
- `frames.image_embedding` - Stored alongside frame metadata
- `episodes.text_embedding` - Stored alongside episode data

### Advantages of Current Approach

1. **Simplicity**
   - Single query to get data + embedding
   - No joins or separate lookups needed
   - Atomic updates (data and embedding together)

2. **MongoDB Atlas Vector Search Native Support**
   - Vector search indexes work directly on embedded fields
   - `$vectorSearch` aggregation stage can query directly
   - No need for separate collections or databases

3. **Performance**
   - Embeddings are co-located with data
   - Faster queries (no joins)
   - Better cache locality

4. **Consistency**
   - Data and embeddings are always in sync
   - Single source of truth
   - Easier to maintain referential integrity

5. **Cost Efficiency**
   - No additional infrastructure needed
   - Single database to manage
   - No synchronization overhead

### Disadvantages of Current Approach

1. **Document Size**
   - Embeddings are large (1024+ floats = ~4KB+ per embedding)
   - Increases document size and memory usage
   - May hit MongoDB 16MB document size limit (unlikely with current schema)

2. **Read Performance (when embeddings not needed)**
   - Embeddings are included in full document reads
   - Need to explicitly exclude in projections: `{ image_embedding: 0 }`
   - Slightly larger network transfer

3. **Update Overhead**
   - Updating embeddings requires updating entire document
   - More write operations if only embedding changes

## Alternative Approaches

### Option 1: Separate Embeddings Collection

**Structure:**
```
frames_embeddings collection:
{
  frame_id: UUID,
  image_embedding: number[],
  model_version: string,
  created_at: Date,
  updated_at: Date
}
```

**Pros:**
- Smaller main documents
- Can query embeddings independently
- Easier to manage embedding versions

**Cons:**
- Requires joins/lookups for queries
- More complex queries
- Potential consistency issues
- MongoDB vector search requires embeddings in same collection

### Option 2: Separate Database

**Structure:**
- `w24h` database: Original data (frames, episodes)
- `w24h_embeddings` database: Embeddings only

**Pros:**
- Complete separation of concerns
- Can scale independently
- Different retention policies

**Cons:**
- Complex architecture
- Requires application-level joins
- Cannot use MongoDB vector search across databases
- Synchronization complexity

### Option 3: External Vector Database (Pinecone, Weaviate, Qdrant)

**Structure:**
- MongoDB: Original data
- External DB: Embeddings only

**Pros:**
- Specialized vector search capabilities
- Potentially better performance for large-scale search
- Advanced features (filtering, reranking)

**Cons:**
- Additional infrastructure and cost
- Data synchronization complexity
- Vendor lock-in
- More complex architecture

## Recommendation: Keep Embeddings in Same Document

### ✅ **Recommended: Current Approach (Embeddings in Same Document)**

**Reasons:**

1. **MongoDB Atlas Vector Search Requirements**
   - Vector search indexes must be on fields in the same collection
   - `$vectorSearch` works on fields in the queried collection
   - Cannot perform vector search across collections efficiently

2. **Query Patterns**
   - Most queries need both data AND embeddings together
   - Vector search returns documents with similarity scores
   - Natural to have embeddings with source data

3. **Current Scale**
   - Document sizes are manageable (embeddings ~4KB)
   - Well within MongoDB limits
   - No performance issues at current scale

4. **Simplicity**
   - Single source of truth
   - Easier to maintain and debug
   - No synchronization needed

### Implementation Notes

**For Empty Embeddings:**

1. **Initial State:**
   ```typescript
   image_embedding: null  // or simply omit the field
   text_embedding: null   // or simply omit the field
   ```

2. **Querying for Missing Embeddings:**
   ```typescript
   // Find frames without embeddings
   { image_embedding: null }
   
   // Find episodes without embeddings
   { text_embedding: null }
   ```

3. **Updating Embeddings:**
   ```typescript
   // Update frame with embedding
   await framesCollection.updateOne(
     { frame_id },
     { $set: { image_embedding: embedding, updated_at: new Date() } }
   );
   ```

4. **Vector Search Index:**
   - Create index on `episodes.text_embedding` in MongoDB Atlas UI
   - Index will automatically handle null values (skip them)
   - Only documents with embeddings will be searchable

### When to Consider Alternatives

Consider separate storage if:
- Document size becomes an issue (>10MB per document)
- Need to update embeddings very frequently without touching data
- Require specialized vector search features not in MongoDB
- Scale exceeds MongoDB capabilities (millions+ documents with embeddings)

## Current Schema Validation

### ✅ Schema is Well-Designed For:

1. **Nullable Embeddings**
   - `number[] | null` allows documents without embeddings
   - Easy to query for missing embeddings
   - Can populate embeddings asynchronously

2. **Vector Search Compatibility**
   - Embeddings in same collection as data
   - Can create vector search indexes directly
   - Compatible with `$vectorSearch` aggregation

3. **Flexibility**
   - Can add embeddings later via batch processing
   - Individual update endpoints available
   - Graceful degradation (works without embeddings)

## Conclusion

**Keep embeddings in the same MongoDB Atlas documents.** This approach:
- ✅ Works natively with MongoDB Atlas Vector Search
- ✅ Simplifies queries and architecture
- ✅ Maintains data consistency
- ✅ Is performant for current and near-term scale
- ✅ Allows easy batch processing of missing embeddings

The current schema design is optimal for this use case. No changes needed.

