/**
 * Query routes
 * Handles natural language queries against episodes using vector search
 */

import { Router, Request, Response } from 'express';
import { QueryEpisodesSchema, QueryEpisodesResult } from '../types';
import { getEpisodesCollection } from '../db';
import { embedText } from '../voyage';

const router = Router();

/**
 * POST /query
 * Query episodes using natural language and vector search
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = QueryEpisodesSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.errors,
      });
    }

    const { query, limit, min_score } = validationResult.data;
    const episodesCollection = await getEpisodesCollection();

    // Generate embedding for the query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedText(query);
    } catch (error) {
      console.error('Failed to generate query embedding:', error);
      return res.status(500).json({
        error: 'Failed to generate query embedding',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Perform vector search using Atlas Vector Search
    // Note: This requires a vector search index to be created in Atlas UI
    // The index should be on the 'text_embedding' field
    try {
      const pipeline = [
        {
          $vectorSearch: {
            index: 'vector_search_text_embedding', // Index name (create in Atlas UI)
            path: 'text_embedding',
            queryVector: queryEmbedding,
            numCandidates: limit * 10, // Search more candidates for better results
            limit: limit,
          },
        },
        {
          $project: {
            episode_id: 1,
            title: 1,
            summary_text: 1,
            start_ts: 1,
            end_ts: 1,
            tags: 1,
            frame_ids: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
        ...(min_score !== undefined
          ? [
              {
                $match: {
                  score: { $gte: min_score },
                },
              },
            ]
          : []),
      ];

      const results = await episodesCollection.aggregate(pipeline).toArray();

      // Transform results
      const episodes: QueryEpisodesResult[] = results.map((doc) => ({
        episode_id: doc.episode_id,
        title: doc.title,
        summary_text: doc.summary_text,
        start_ts: doc.start_ts,
        end_ts: doc.end_ts,
        tags: doc.tags,
        frame_ids: doc.frame_ids,
        score: doc.score,
      }));

      res.json({
        query,
        results: episodes,
        count: episodes.length,
      });
    } catch (error) {
      // If vector search fails, fall back to text search
      console.warn('Vector search failed, falling back to text search:', error);
      
      // Simple text search fallback
      const textResults = await episodesCollection
        .find({
          $or: [
            { title: { $regex: query, $options: 'i' } },
            { summary_text: { $regex: query, $options: 'i' } },
          ],
          text_embedding: { $ne: null }, // Only episodes with embeddings
        })
        .limit(limit)
        .toArray();

      const episodes: QueryEpisodesResult[] = textResults.map((doc) => ({
        episode_id: doc.episode_id,
        title: doc.title,
        summary_text: doc.summary_text,
        start_ts: doc.start_ts,
        end_ts: doc.end_ts,
        tags: doc.tags,
        frame_ids: doc.frame_ids,
      }));

      res.json({
        query,
        results: episodes,
        count: episodes.length,
        warning: 'Vector search unavailable, using text search fallback',
      });
    }
  } catch (error) {
    console.error('Error querying episodes:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

