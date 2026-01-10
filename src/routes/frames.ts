/**
 * Frame routes
 * Handles creation and management of frames (screenshots)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CreateFrameSchema, FrameDocument } from '../types';
import { getFramesCollection, getEpisodesCollection } from '../db';

const router = Router();

/**
 * POST /frames
 * Create a new frame (screenshot) for an episode
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = CreateFrameSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.errors,
      });
    }

    const input = validationResult.data;
    const framesCollection = await getFramesCollection();
    const episodesCollection = await getEpisodesCollection();

    // Verify episode exists
    const episode = await episodesCollection.findOne({ episode_id: input.episode_id });
    if (!episode) {
      return res.status(404).json({
        error: 'Episode not found',
      });
    }

    // Generate frame_id if not provided
    const frame_id = input.frame_id || uuidv4();

    // Check if frame_id already exists
    const existing = await framesCollection.findOne({ frame_id });
    if (existing) {
      return res.status(409).json({
        error: 'Frame with this frame_id already exists',
      });
    }

    // Create frame document
    const now = new Date();
    const frame: FrameDocument = {
      frame_id,
      episode_id: input.episode_id,
      ts: input.ts,
      s3_key: input.s3_key,
      url: input.url,
      caption: input.caption,
      image_embedding: null, // Not implemented in MVP Step 1
      created_at: now,
      updated_at: now,
    };

    // Insert into database
    await framesCollection.insertOne(frame);

    // Update episode's frame_ids array
    await episodesCollection.updateOne(
      { episode_id: input.episode_id },
      { 
        $addToSet: { frame_ids: frame_id },
        $set: { updated_at: now },
      }
    );

    res.status(201).json({
      frame_id,
      message: 'Frame created successfully',
    });
  } catch (error) {
    console.error('Error creating frame:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /frames/:frame_id
 * Get a specific frame by ID
 */
router.get('/:frame_id', async (req: Request, res: Response) => {
  try {
    const { frame_id } = req.params;
    const framesCollection = await getFramesCollection();

    const frame = await framesCollection.findOne(
      { frame_id },
      { projection: { image_embedding: 0 } } // Exclude embedding from response
    );

    if (!frame) {
      return res.status(404).json({
        error: 'Frame not found',
      });
    }

    res.json(frame);
  } catch (error) {
    console.error('Error fetching frame:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

