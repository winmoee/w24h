# Activity Tracking System

This document describes the activity tracking system that collects comprehensive user activity data from the Electron app.

## What Data is Collected

### 1. **Window/Application Information**
- Active application name
- Window title
- Bundle ID (macOS) / Process path (Windows/Linux)
- Window focus/blur events

### 2. **Idle Time Tracking**
- Time since last user input (seconds)
- Idle status (true/false based on threshold)
- Time since last activity (milliseconds)

### 3. **System Metrics** (collected every interval)
- CPU usage (user/system times)
- Memory usage (heap, external, RSS)
- System load average
- Free/total memory
- System uptime

### 4. **System Information** (collected once at startup)
- Platform (darwin/win32/linux)
- Platform version
- Architecture (x64/arm64)
- CPU model and count
- Total memory
- Hostname and username
- Node.js, Electron, Chrome, V8 versions

### 5. **Screenshots** (already implemented)
- Linked to activity events when captured
- Stored locally and uploaded to Vercel Blob

## Collection Frequency

- **Default**: Every 10 seconds
- **Configurable**: Set `collectionInterval` in `activityTracker.js`

## Data Flow

```
Electron App (Renderer Process)
  ↓ Collects activity data
ActivityTracker Module
  ↓ Sends JSON via HTTP POST
Python Backend (/api/activity)
  ↓ Logs data (ready for DB storage)
Future: Database (activity_logs table)
```

## Platform-Specific Notes

### macOS
- **Active Window**: Uses AppleScript (requires Accessibility permissions)
- **Idle Time**: Uses `ioreg` command
- **Permissions**: System Preferences → Security & Privacy → Privacy → Accessibility

### Windows
- **Active Window**: Uses PowerShell with Windows API calls
- **Idle Time**: Uses `GetLastInputInfo` API

### Linux
- **Active Window**: Uses `xdotool` (install: `sudo apt-get install xdotool`)
- **Idle Time**: Uses `xprintidle` (install: `sudo apt-get install xprintidle`)

## Installation Requirements

### macOS
No additional packages needed, but requires:
- Accessibility permissions granted in System Preferences

### Linux
```bash
sudo apt-get install xdotool xprintidle
```

### Windows
No additional packages needed (uses built-in PowerShell)

## Configuration

### Electron App
Edit `src/main.js`:
```javascript
const activityServerUrl = process.env.ACTIVITY_SERVER_URL || 'http://localhost:8000/api/activity';
```

Or set environment variable:
```bash
export ACTIVITY_SERVER_URL="http://localhost:8000/api/activity"
```

### Python Backend
The endpoint is automatically available at:
- **Local**: `http://localhost:8000/api/activity`
- **Production**: `https://your-server.com/api/activity`

## Database Schema

See `backend/activity_schema.sql` for complete database schema including:
- `activity_logs` - Main activity tracking table
- `screenshots` - Screenshot metadata linked to activities
- `user_sessions` - Session tracking
- `app_usage_stats` - Aggregated app usage per session
- `daily_activity_summary` - Daily aggregated summaries

## Data Structure Example

```json
{
  "timestamp": "2026-01-10T12:43:31.000Z",
  "unixTimestamp": 1704891811000,
  "eventType": "active",
  "window": {
    "appName": "Google Chrome",
    "windowTitle": "Activity Tracking - GitHub",
    "bundleId": "com.google.Chrome",
    "processPath": "/Applications/Google Chrome.app"
  },
  "activity": {
    "idleTime": 5,
    "isIdle": false,
    "timeSinceLastActivity": 5000
  },
  "system": {
    "cpuUsage": {
      "user": 123456,
      "system": 78901
    },
    "memoryUsage": {
      "heapUsed": 52428800,
      "heapTotal": 67108864,
      "external": 1024000,
      "rss": 125829120
    },
    "loadAverage": [1.5, 1.2, 1.0],
    "freeMemory": 8589934592,
    "totalMemory": 17179869184,
    "uptime": 86400.5
  },
  "systemInfo": {
    "platform": "darwin",
    "platformVersion": "21.6.0",
    "architecture": "arm64",
    "cpuModel": "Apple M1",
    "cpuCount": 8,
    "hostname": "MacBook-Pro.local",
    "username": "frankwin"
  }
}
```

## Future Enhancements

1. **Keyboard/Mouse Activity**
   - Key presses (with privacy considerations)
   - Mouse movement/click tracking
   - Clipboard monitoring (opt-in)

2. **Network Activity**
   - Active network connections
   - Bandwidth usage

3. **Application Tracking**
   - Time spent in each app
   - Application launch/quit events
   - File system monitoring (with permissions)

4. **Enhanced Analytics**
   - Productivity scoring
   - Distraction detection
   - Time breakdown by category

## Privacy Considerations

- **Sensitive Data**: Window titles may contain sensitive information
- **Permissions**: macOS requires Accessibility permissions
- **Opt-in**: Consider making activity tracking opt-in
- **Data Storage**: Encrypt sensitive data in database
- **Retention**: Implement data retention policies
- **Compliance**: Consider GDPR/privacy regulations

## Testing

1. **Start Python Backend**:
   ```bash
   cd my-c1-app/my-c1-project/backend
   source ../../myenv/bin/activate
   uvicorn main:app --reload
   ```

2. **Start Electron App**:
   ```bash
   cd screenshot-app-electron-master
   npm start
   ```

3. **Check Backend Logs**:
   You should see activity data being received every 10 seconds:
   ```
   [ACTIVITY] ========================================
   [ACTIVITY] Received activity data:
     Timestamp: 2026-01-10T12:43:31.000Z
     Event Type: active
     Window: Google Chrome - Activity Tracking
     ...
   ```

4. **Check Electron Logs**:
   Activity tracking should start automatically and log:
   ```
   [ACTIVITY] Starting activity tracker...
   [ACTIVITY] Collection interval: 10000 ms
   [ACTIVITY] Server URL: http://localhost:8000/api/activity
   ```

## Troubleshooting

### macOS: "Accessibility permissions not granted"
- Go to System Preferences → Security & Privacy → Privacy → Accessibility
- Add the Electron app to allowed apps
- Restart the app

### Linux: "xdotool not found"
```bash
sudo apt-get install xdotool
```

### Linux: "xprintidle not found"
```bash
sudo apt-get install xprintidle
```

### Activity data not being sent
- Check backend is running: `curl http://localhost:8000/`
- Check Electron console logs
- Check backend logs for errors
- Verify ACTIVITY_SERVER_URL is set correctly

### Idle time always 0
- Check platform-specific tools are installed (xprintidle on Linux)
- Verify permissions (macOS Accessibility)
- Check console for errors

