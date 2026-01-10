/**
 * MongoDB connection and database utilities
 */

import { MongoClient, Db, Collection } from 'mongodb';
import dns from 'dns';

// Use Google DNS to avoid system DNS resolution issues with MongoDB SRV records
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connects to MongoDB Atlas
 * @returns Promise resolving to the database instance
 */
export async function connectDB(): Promise<Db> {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const dbName = process.env.MONGODB_DB || 'w24h';

  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 20000,
    });
    await client.connect();
    db = client.db(dbName);
    
    // Create vector search indexes if they don't exist
    await ensureVectorSearchIndexes(db);
    
    return db;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to connect to MongoDB: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Gets the episodes collection
 */
export async function getEpisodesCollection(): Promise<Collection> {
  const database = await connectDB();
  return database.collection('episodes');
}

/**
 * Gets the frames collection
 */
export async function getFramesCollection(): Promise<Collection> {
  const database = await connectDB();
  return database.collection('frames');
}

/**
 * Ensures vector search indexes exist for episodes collection
 * Note: This is a best-effort attempt. Indexes may need to be created
 * manually in Atlas UI for vector search to work properly.
 */
async function ensureVectorSearchIndexes(database: Db): Promise<void> {
  try {
    const episodesCollection = database.collection('episodes');
    
    // Check if vector search index exists
    // Note: Vector search indexes are typically created via Atlas UI
    // This is just a placeholder for documentation purposes
    const indexes = await episodesCollection.indexes();
    const hasVectorIndex = indexes.some(idx => 
      idx.name === 'vector_search_text_embedding'
    );
    
    if (!hasVectorIndex) {
      // Log a warning - actual index creation should be done in Atlas UI
      console.warn(
        'Vector search index not found. ' +
        'Please create a vector search index on episodes.text_embedding ' +
        'in MongoDB Atlas UI for query functionality to work.'
      );
    }
  } catch (error) {
    // Non-fatal - indexes can be created manually
    console.warn('Could not verify vector search indexes:', error);
  }
}

/**
 * Closes the MongoDB connection
 */
export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

