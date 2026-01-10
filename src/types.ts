/**
 * TypeScript types and Zod schemas for request validation
 */

import { z } from 'zod';

// ============================================================================
// Episode Types
// ============================================================================

export interface EpisodeDocument {
  _id?: any;
  episode_id: string;
  start_ts: number;
  end_ts: number;
  title: string;
  summary_text: string;
  tags: {
    project?: string;
    app?: string;
    url?: string;
    branch?: string;
    error_keywords?: string[];
  };
  frame_ids: string[];
  text_embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

export const CreateEpisodeSchema = z.object({
  episode_id: z.string().uuid().optional(),
  start_ts: z.number().int().positive(),
  end_ts: z.number().int().positive(),
  title: z.string().min(1),
  summary_text: z.string().min(1),
  tags: z.object({
    project: z.string().optional(),
    app: z.string().optional(),
    url: z.string().url().optional(),
    branch: z.string().optional(),
    error_keywords: z.array(z.string()).optional(),
  }).optional(),
  frame_ids: z.array(z.string().uuid()).optional(),
});

export type CreateEpisodeInput = z.infer<typeof CreateEpisodeSchema>;

// ============================================================================
// Frame Types
// ============================================================================

export interface FrameDocument {
  _id?: any;
  frame_id: string;
  episode_id: string;
  ts: number;
  s3_key?: string;
  url?: string;
  caption?: string;
  image_embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

export const CreateFrameSchema = z.object({
  frame_id: z.string().uuid().optional(),
  episode_id: z.string().uuid(),
  ts: z.number().int().positive(),
  s3_key: z.string().optional(),
  url: z.string().url().optional(),
  caption: z.string().optional(),
}).refine(
  (data) => data.s3_key || data.url,
  {
    message: 'Either s3_key or url must be provided',
  }
);

export type CreateFrameInput = z.infer<typeof CreateFrameSchema>;

// ============================================================================
// Query Types
// ============================================================================

export const QueryEpisodesSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional().default(10),
  min_score: z.number().min(0).max(1).optional(),
});

export type QueryEpisodesInput = z.infer<typeof QueryEpisodesSchema>;

export interface QueryEpisodesResult {
  episode_id: string;
  title: string;
  summary_text: string;
  start_ts: number;
  end_ts: number;
  tags: EpisodeDocument['tags'];
  frame_ids: string[];
  score?: number;
}

