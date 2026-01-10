# Activity Data Schema Documentation

This document describes the database schema for storing activity tracking data.

## Database Tables

### 1. `activity_logs` - Main Activity Tracking Table

Stores all activity events collected from the Electron app.

**Columns:**
- `id` (BIGSERIAL PRIMARY KEY) - Auto-incrementing ID
- `timestamp` (TIMESTAMP) - Readable timestamp (ISO format)
- `unix_timestamp` (BIGINT) - Unix timestamp in milliseconds
- `event_type` (VARCHAR(20)) - Either 'idle' or 'active'
- `app_name` (VARCHAR(255)) - Name of active application
- `window_title` (TEXT) - Title of active window
- `bundle_id` (VARCHAR(255)) - Bundle ID (macOS) or NULL
- `process_path` (TEXT) - Process path or NULL
- `idle_time` (INTEGER) - Seconds since last user input
- `is_idle` (BOOLEAN) - True if user is idle
- `time_since_last_activity` (INTEGER) - Milliseconds since last activity
- `cpu_usage` (JSONB) - CPU usage metrics (JSON)
- `memory_usage` (JSONB) - Memory usage metrics (JSON)
- `load_average` (JSONB) - System load average (JSON array)
- `free_memory` (BIGINT) - Free memory in bytes
- `total_memory` (BIGINT) - Total memory in bytes
- `system_uptime` (FLOAT) - System uptime in seconds
- `platform` (VARCHAR(50)) - Platform (darwin/win32/linux)
- `platform_version` (VARCHAR(100)) - OS version
- `architecture` (VARCHAR(50)) - Architecture (x64/arm64)
- `cpu_model` (TEXT) - CPU model name
- `cpu_count` (INTEGER) - Number of CPU cores
- `hostname` (VARCHAR(255)) - System hostname
- `username` (VARCHAR(100)) - Current username
- `node_version` (VARCHAR(50)) - Node.js version
- `electron_version` (VARCHAR(50)) - Electron version
- `chrome_version` (VARCHAR(50)) - Chrome version
- `created_at` (TIMESTAMP) - Record creation timestamp

**Indexes:**
- `idx_activity_timestamp` - On `timestamp`
- `idx_activity_event_type` - On `event_type`
- `idx_activity_app_name` - On `app_name`
- `idx_activity_unix_timestamp` - On `unix_timestamp`
- `idx_activity_created_at` - On `created_at`

### 2. `screenshots` - Screenshot Metadata Table

Links screenshots to activity events.

**Columns:**
- `id` (BIGSERIAL PRIMARY KEY) - Auto-incrementing ID
- `activity_log_id` (BIGINT) - Foreign key to `activity_logs.id` (nullable)
- `filename` (VARCHAR(255)) - Screenshot filename
- `local_path` (TEXT) - Local file path
- `blob_url` (TEXT) - Vercel Blob URL (if uploaded)
- `blob_pathname` (TEXT) - Blob storage pathname
- `file_size` (BIGINT) - File size in bytes
- `content_type` (VARCHAR(50)) - MIME type (default: 'image/png')
- `width` (INTEGER) - Image width (nullable)
- `height` (INTEGER) - Image height (nullable)
- `captured_at` (TIMESTAMP) - When screenshot was captured
- `uploaded_at` (TIMESTAMP) - When screenshot was uploaded (nullable)
- `created_at` (TIMESTAMP) - Record creation timestamp

**Indexes:**
- `idx_screenshots_activity_log_id` - On `activity_log_id`
- `idx_screenshots_captured_at` - On `captured_at`
- `idx_screenshots_blob_url` - On `blob_url`

**Foreign Keys:**
- `activity_log_id` → `activity_logs.id` (ON DELETE SET NULL)

### 3. `user_sessions` - User Session Tracking

Tracks active user sessions.

**Columns:**
- `id` (BIGSERIAL PRIMARY KEY) - Auto-incrementing ID
- `session_id` (UUID) - Unique session identifier
- `hostname` (VARCHAR(255)) - System hostname
- `username` (VARCHAR(100)) - Username
- `platform` (VARCHAR(50)) - Platform
- `platform_version` (VARCHAR(100)) - OS version
- `session_start` (TIMESTAMP) - Session start time
- `session_end` (TIMESTAMP) - Session end time (nullable)
- `last_activity` (TIMESTAMP) - Last activity timestamp (nullable)
- `total_activity_logs` (INTEGER) - Count of activity logs (default: 0)
- `total_screenshots` (INTEGER) - Count of screenshots (default: 0)
- `total_idle_time` (INTEGER) - Total idle time in seconds (default: 0)
- `total_active_time` (INTEGER) - Total active time in seconds (default: 0)
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Record update timestamp

**Indexes:**
- `idx_sessions_session_id` - On `session_id` (unique)
- `idx_sessions_session_start` - On `session_start`
- `idx_sessions_hostname` - On `hostname`

### 4. `app_usage_stats` - Application Usage Statistics

Aggregated app usage per session.

**Columns:**
- `id` (BIGSERIAL PRIMARY KEY) - Auto-incrementing ID
- `session_id` (UUID) - Foreign key to `user_sessions.session_id`
- `app_name` (VARCHAR(255)) - Application name
- `bundle_id` (VARCHAR(255)) - Bundle ID (nullable)
- `total_time` (INTEGER) - Total time spent in app (seconds)
- `active_windows` (INTEGER) - Number of active windows (default: 0)
- `window_titles` (JSONB) - Array of window titles (JSON)
- `first_seen` (TIMESTAMP) - First time app was used
- `last_seen` (TIMESTAMP) - Last time app was used
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Record update timestamp

**Indexes:**
- `idx_app_usage_session_id` - On `session_id`
- `idx_app_usage_app_name` - On `app_name`
- `idx_app_usage_total_time` - On `total_time`

**Constraints:**
- UNIQUE(`session_id`, `app_name`) - One record per app per session

**Foreign Keys:**
- `session_id` → `user_sessions.session_id` (ON DELETE CASCADE)

### 5. `daily_activity_summary` - Daily Aggregated Summaries

Daily aggregated data for reporting.

**Columns:**
- `id` (BIGSERIAL PRIMARY KEY) - Auto-incrementing ID
- `session_id` (UUID) - Foreign key to `user_sessions.session_id`
- `date` (DATE) - The date (YYYY-MM-DD)
- `total_active_time` (INTEGER) - Total active time in seconds
- `total_idle_time` (INTEGER) - Total idle time in seconds
- `total_tracked_time` (INTEGER) - Total tracked time (active + idle)
- `total_events` (INTEGER) - Total event count (default: 0)
- `active_events` (INTEGER) - Active event count (default: 0)
- `idle_events` (INTEGER) - Idle event count (default: 0)
- `screenshots_count` (INTEGER) - Number of screenshots (default: 0)
- `top_apps` (JSONB) - Top applications array (JSON)
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Record update timestamp

**Indexes:**
- `idx_daily_summary_session_id` - On `session_id`
- `idx_daily_summary_date` - On `date`

**Constraints:**
- UNIQUE(`session_id`, `date`) - One summary per session per day

**Foreign Keys:**
- `session_id` → `user_sessions.session_id` (ON DELETE CASCADE)

## Data Types

### JSON Fields (JSONB in PostgreSQL)

**`cpu_usage`**:
```json
{
  "user": 123456,
  "system": 78901
}
```

**`memory_usage`**:
```json
{
  "heapUsed": 52428800,
  "heapTotal": 67108864,
  "external": 1024000,
  "rss": 125829120
}
```

**`load_average`**:
```json
[1.5, 1.2, 1.0]
```

**`window_titles`** (app_usage_stats):
```json
["Activity Tracking - GitHub", "README.md - VS Code", "Settings"]
```

**`top_apps`** (daily_activity_summary):
```json
[
  {"app_name": "Google Chrome", "time": 3600},
  {"app_name": "VS Code", "time": 1800},
  {"app_name": "Terminal", "time": 900}
]
```

## Example Queries

### Get recent activity
```sql
SELECT * FROM activity_logs 
ORDER BY timestamp DESC 
LIMIT 100;
```

### Get app usage statistics for a session
```sql
SELECT app_name, total_time, active_windows 
FROM app_usage_stats 
WHERE session_id = '...' 
ORDER BY total_time DESC;
```

### Get daily summary
```sql
SELECT * FROM daily_activity_summary 
WHERE session_id = '...' 
ORDER BY date DESC;
```

### Get screenshots linked to activities
```sql
SELECT s.*, a.app_name, a.window_title 
FROM screenshots s
LEFT JOIN activity_logs a ON s.activity_log_id = a.id
ORDER BY s.captured_at DESC;
```

## Migration Notes

### PostgreSQL (Recommended)
- Use schema as-is
- JSONB provides good performance and indexing capabilities

### SQLite
- Change `BIGSERIAL` to `INTEGER`
- Remove UUID type, use `TEXT` instead
- Change JSONB to `TEXT`
- Index syntax: `CREATE INDEX idx_name ON table(column)`

### MySQL
- Change `BIGSERIAL` to `BIGINT AUTO_INCREMENT`
- Change JSONB to `JSON`
- Index syntax: `CREATE INDEX idx_name ON table(column)`

## Future Enhancements

Consider adding:
- **User management** table if multi-user
- **Device management** table for multiple devices
- **Privacy settings** table for opt-in/opt-out features
- **Data retention** policies and automatic cleanup
- **Encryption** for sensitive fields like `window_title`

