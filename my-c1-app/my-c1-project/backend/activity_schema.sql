-- Simplified Activity Tracking Database Schema
-- MongoDB Collections: frames (screenshots) and episodes (grouped by app_name)

-- Frames collection - one document per screenshot
-- {
--   _id: ObjectId,
--   frame_id: string (UUID),
--   episode_id: string (UUID), -- Links to episode
--   ts: number (milliseconds timestamp),
--   app_name: string, -- App name when screenshot was taken
--   window_title: string (optional),
--   screenshot_path: string, -- Local path to screenshot
--   blob_url: string (optional), -- Vercel Blob URL if uploaded
--   blob_pathname: string (optional),
--   file_size: number, -- bytes
--   content_type: string, -- 'image/png'
--   created_at: Date
-- }

-- Episodes collection - groups frames together when app_name is the same
-- A new episode starts when app_name changes
-- {
--   _id: ObjectId,
--   episode_id: string (UUID),
--   app_name: string, -- The app this episode represents
--   frame_ids: string[], -- Array of frame_id UUIDs in this episode
--   start_ts: number (milliseconds), -- When episode started
--   end_ts: number (milliseconds, nullable), -- When episode ended (set when app_name changes)
--   frame_count: number, -- Number of frames in this episode
--   created_at: Date,
--   updated_at: Date
-- }

-- Indexes to create in MongoDB:
-- db.frames.createIndex({ "episode_id": 1 })
-- db.frames.createIndex({ "ts": -1 })
-- db.frames.createIndex({ "app_name": 1 })
-- 
-- db.episodes.createIndex({ "episode_id": 1 }, { unique: true })
-- db.episodes.createIndex({ "app_name": 1 })
-- db.episodes.createIndex({ "start_ts": -1 })
-- db.episodes.createIndex({ "end_ts": 1 })

-- Logic:
-- - When a screenshot is taken, check if current app_name matches last episode's app_name
-- - If yes: Add frame_id to existing episode (update frame_count, end_ts, updated_at)
-- - If no: Create new episode, set end_ts of previous episode, add frame to new episode

-- Example:
-- Episode 1: app_name="Chrome", frame_ids: [frame1, frame2, frame3]
-- Episode 2: app_name="VS Code", frame_ids: [frame4, frame5]
-- Episode 3: app_name="Chrome", frame_ids: [frame6, frame7, frame8]
--
-- When user switches from Chrome to VS Code, Episode 1 ends and Episode 2 starts

