# Activity Tracking Implementation Summary

## What Was Implemented

### ✅ Electron App (Activity Tracker Module)

**File**: `src/activityTracker.js`

**Capabilities**:
1. **Window/App Tracking**: Collects active application name, window title, bundle ID, and process path
   - macOS: Uses AppleScript (requires Accessibility permissions)
   - Windows: Uses PowerShell with Windows API
   - Linux: Uses xdotool (requires installation)

2. **Idle Time Tracking**: Monitors user inactivity
   - macOS: Uses `ioreg` command
   - Windows: Uses `GetLastInputInfo` API via PowerShell
   - Linux: Uses `xprintidle` (requires installation)

3. **System Metrics**: Collects real-time system information
   - CPU usage (user/system times)
   - Memory usage (heap, external, RSS)
   - System load average
   - Free/total memory
   - System uptime

4. **System Info**: Collects static system information (once at startup)
   - Platform, version, architecture
   - CPU model and count
   - Hostname, username
   - Node.js, Electron, Chrome, V8 versions

**Collection Frequency**: Every 10 seconds (configurable)

**Data Format**: JSON with nested objects for window, activity, system, and systemInfo

### ✅ Python Backend (Activity Endpoint)

**File**: `my-c1-app/my-c1-project/backend/main.py`

**Endpoint**: `POST /api/activity`

**Functionality**:
- Receives activity data from Electron app
- Validates data using Pydantic models
- Logs all activity data to console
- Returns success response
- Ready for database storage (TODO comments included)

**Models Defined**:
- `WindowInfo`: Window/application information
- `ActivityInfo`: Idle time and activity status
- `SystemMetrics`: Real-time system metrics
- `SystemInfo`: Static system information
- `ActivityData`: Complete activity event data

### ✅ Database Schema

**File**: `my-c1-app/my-c1-project/backend/activity_schema.sql`

**Tables Defined**:
1. **`activity_logs`**: Main activity tracking table (29 columns)
2. **`screenshots`**: Screenshot metadata linked to activities
3. **`user_sessions`**: Session tracking and statistics
4. **`app_usage_stats`**: Aggregated app usage per session
5. **`daily_activity_summary`**: Daily aggregated summaries

**Features**:
- PostgreSQL, SQLite, and MySQL compatible
- Comprehensive indexes for performance
- JSONB fields for flexible data storage
- Foreign key relationships
- Unique constraints where appropriate

### ✅ Documentation

1. **ACTIVITY_TRACKING.md**: Complete guide to activity tracking system
2. **DATA_COLLECTION.md**: Comprehensive list of collectable data
3. **ACTIVITY_DATA_SCHEMA.md**: Detailed database schema documentation
4. **activity_schema.sql**: Ready-to-use SQL schema

## Integration

### Electron App
- Activity tracker automatically initializes when renderer loads
- Main process sends server URL via IPC after page loads
- Activity data is collected every 10 seconds and sent to Python backend
- Logs activity to both console and main process terminal

### Python Backend
- Endpoint is at `/api/activity`
- CORS enabled for Electron app requests
- Validates incoming data with Pydantic
- Logs all received data
- Ready for database integration

## Configuration

### Electron App
Set activity server URL:
```javascript
// In main.js or via environment variable
const activityServerUrl = process.env.ACTIVITY_SERVER_URL || 'http://localhost:8000/api/activity';
```

### Python Backend
No additional configuration needed - endpoint is automatically available

## What Data is Collected (Summary)

### Window/App Information ✅
- Active application name
- Window title
- Bundle ID (macOS) / Process path (Windows/Linux)

### Idle Time ✅
- Seconds since last user input
- Idle status (true/false)
- Time since last activity (milliseconds)

### System Metrics ✅
- CPU usage (user/system)
- Memory usage (heap/external/RSS)
- Load average (1/5/15 min)
- Free/total memory
- System uptime

### System Information ✅
- Platform, version, architecture
- CPU model and count
- Hostname, username
- Software versions (Node, Electron, Chrome, V8)

### Screenshots ✅ (Already Implemented)
- Full screen captures
- Automatic every 1 minute
- Manual capture
- Saved locally + uploaded to Vercel Blob

## Future Enhancements (Not Yet Implemented)

### Keyboard/Mouse Activity
- Key press events (without capturing actual keys)
- Mouse movement distance
- Click events
- Typing patterns

### Network Activity
- Active network connections
- Bandwidth usage
- Network interface stats

### Application Lifecycle
- App launch/quit events
- Window open/close events
- App crash events

### File System Activity
- Files opened (app level)
- Files saved
- Directory changes

### Power/Battery
- Battery level
- Power source (AC/battery)
- Charging status

## Permissions Required

### macOS
- **Accessibility**: Required for window/app detection
  - System Preferences → Security & Privacy → Privacy → Accessibility
  - Add Electron app to allowed apps

### Linux
- **xdotool**: For window detection
  ```bash
  sudo apt-get install xdotool
  ```
- **xprintidle**: For idle time detection
  ```bash
  sudo apt-get install xprintidle
  ```

### Windows
- No additional permissions or tools needed

## Testing

1. **Start Python Backend**:
   ```bash
   cd my-c1-app/my-c1-project/backend
   source ../../myenv/bin/activate
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Start Electron App**:
   ```bash
   cd screenshot-app-electron-master
   npm start
   ```

3. **Check Logs**:
   - Electron terminal: Should see `[MAIN] Activity tracker initialized...`
   - Electron console: Should see `[ACTIVITY] Starting activity tracker...`
   - Backend terminal: Should see activity data every 10 seconds:
     ```
     [ACTIVITY] ========================================
     [ACTIVITY] Received activity data:
       Timestamp: 2026-01-10T12:43:31.000Z
       Event Type: active
       Window: Google Chrome - Activity Tracking
       ...
     ```

## Next Steps

1. **Database Integration**: 
   - Choose database (PostgreSQL recommended)
   - Run `activity_schema.sql` to create tables
   - Update `/api/activity` endpoint to store data in database
   - Use the TODO comments in `main.py` as guide

2. **Additional Tracking**:
   - Implement keyboard/mouse activity tracking
   - Add network activity monitoring
   - Add application lifecycle events

3. **Privacy & Security**:
   - Add data encryption for sensitive fields
   - Implement data retention policies
   - Add opt-in/opt-out features
   - Add user consent mechanisms

4. **Analytics & Reporting**:
   - Create dashboard for viewing activity data
   - Implement daily/weekly/monthly summaries
   - Add productivity metrics
   - Create visualizations

