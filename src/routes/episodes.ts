/**
 * Episode routes
 * Handles creation and management of episodes
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CreateEpisodeSchema, EpisodeDocument } from '../types';
import { getEpisodesCollection } from '../db';
import { embedText } from '../voyage';

const router = Router();

/**
 * POST /episodes
 * Create a new episode with text embedding
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = CreateEpisodeSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.errors,
      });
    }

    const input = validationResult.data;
    const episodesCollection = await getEpisodesCollection();

    // Generate episode_id if not provided
    const episode_id = input.episode_id || uuidv4();

    // Check if episode_id already exists
    const existing = await episodesCollection.findOne({ episode_id });
    if (existing) {
      return res.status(409).json({
        error: 'Episode with this episode_id already exists',
      });
    }

    // Generate text embedding
    let text_embedding: number[] | null = null;
    try {
      const embeddingText = `${input.title}\n\n${input.summary_text}`;
      text_embedding = await embedText(embeddingText);
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      // Continue without embedding - can be added later
    }

    // Create episode document
    const now = new Date();
    const episode: EpisodeDocument = {
      episode_id,
      start_ts: input.start_ts,
      end_ts: input.end_ts,
      title: input.title,
      summary_text: input.summary_text,
      tags: input.tags || {},
      frame_ids: input.frame_ids || [],
      text_embedding,
      created_at: now,
      updated_at: now,
    };

    // Insert into database
    await episodesCollection.insertOne(episode);

    res.status(201).json({
      episode_id,
      message: 'Episode created successfully',
    });
  } catch (error) {
    console.error('Error creating episode:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /episodes/:episode_id
 * Get a specific episode by ID
 */
router.get('/:episode_id', async (req: Request, res: Response) => {
  try {
    const { episode_id } = req.params;
    const episodesCollection = await getEpisodesCollection();

    const episode = await episodesCollection.findOne(
      { episode_id },
      { projection: { text_embedding: 0 } } // Exclude embedding from response
    );

    if (!episode) {
      return res.status(404).json({
        error: 'Episode not found',
      });
    }

    res.json(episode);
  } catch (error) {
    console.error('Error fetching episode:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

