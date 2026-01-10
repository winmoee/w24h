# Data Collection Capabilities

This document lists all data that the Electron activity tracking app can collect.

## Currently Implemented ✅

### 1. **Screenshots**
- Full screen captures
- Automatic every 1 minute
- Manual capture via keyboard shortcut
- Saved locally and uploaded to Vercel Blob Storage

### 2. **Window/Application Information**
- **Active Application Name**: Name of the currently focused application (e.g., "Google Chrome", "VS Code")
- **Window Title**: Title of the active window (e.g., "GitHub - Pull Requests")
- **Bundle ID** (macOS): Application bundle identifier (e.g., "com.google.Chrome")
- **Process Path**: Full path to the application executable

### 3. **Idle Time Tracking**
- **Idle Time**: Time in seconds since last user input (keyboard/mouse)
- **Idle Status**: Boolean indicating if user is idle (based on threshold)
- **Time Since Last Activity**: Milliseconds since last activity

### 4. **System Metrics** (collected every interval)
- **CPU Usage**: User and system CPU times
- **Memory Usage**: Heap used, heap total, external memory, RSS
- **Load Average**: System load average (1min, 5min, 15min)
- **Free Memory**: Available system memory in bytes
- **Total Memory**: Total system memory in bytes
- **System Uptime**: System uptime in seconds

### 5. **System Information** (collected once at startup)
- **Platform**: Operating system (darwin/win32/linux)
- **Platform Version**: OS version (e.g., "21.6.0" for macOS)
- **Architecture**: CPU architecture (x64/arm64)
- **CPU Model**: CPU model name (e.g., "Apple M1")
- **CPU Count**: Number of CPU cores
- **Hostname**: System hostname
- **Username**: Current user username
- **Home Directory**: User home directory path
- **Node.js Version**: Node.js version
- **Electron Version**: Electron framework version
- **Chrome Version**: Chromium version
- **V8 Version**: V8 JavaScript engine version

## Potential Future Additions (Not Yet Implemented)

### 6. **Keyboard Activity**
- Key press events
- Keyboard shortcuts used
- Typing patterns (with privacy considerations)
- Keys pressed per minute (without capturing actual keys for privacy)

### 7. **Mouse Activity**
- Mouse movement distance
- Mouse clicks (left/right/middle)
- Mouse scroll events
- Clicks per minute
- Movement patterns (high-level, not exact coordinates)

### 8. **Application Lifecycle**
- Application launch events
- Application quit events
- Application focus/blur events
- Window open/close events
- Application crash events

### 9. **Network Activity**
- Active network connections
- Network interface statistics
- Bandwidth usage (in/out)
- Network interface names
- Connection status

### 10. **File System Activity** (requires permissions)
- Files opened (application level, not content)
- Files saved
- Directory changes
- File system events

### 11. **Battery/Power Information**
- Battery level (if laptop)
- Power source (AC/battery)
- Power state changes
- Charging status

### 12. **Display Information**
- Active display/monitor
- Display resolution
- Display refresh rate
- Number of displays
- Display arrangement

### 13. **Process Information**
- Running processes list
- Process CPU usage
- Process memory usage
- Process start time

### 14. **Clipboard Monitoring** (opt-in, privacy-sensitive)
- Clipboard change events
- Clipboard content type (text/image/file)
- Clipboard content size (not content itself)

### 15. **Browser-Specific** (if Electron app opens web pages)
- URL navigation
- Page load times
- Browser history (if enabled)
- Tab activity

## Privacy Considerations

### Sensitive Data
- Window titles may contain sensitive information (documents, URLs, emails)
- Process paths may reveal user directory structure
- Username and hostname are identifying information

### Recommendations
1. **Encryption**: Encrypt sensitive fields in database
2. **Retention**: Implement data retention policies
3. **Opt-in**: Make certain tracking features opt-in
4. **Anonymization**: Consider anonymizing window titles for privacy
5. **Compliance**: Follow GDPR/privacy regulations if handling EU data
6. **User Consent**: Always inform users about data collection

## Data Collection Frequency

- **Screenshots**: Every 60 seconds (configurable)
- **Activity Data**: Every 10 seconds (configurable)
- **System Metrics**: Every 10 seconds (same as activity)
- **System Info**: Once at startup
- **Window Info**: Every 10 seconds (same as activity)

## Data Storage

### Current Implementation
- **Logging**: All activity data is logged to Python backend console
- **Local Storage**: Screenshots saved to `~/Documents/Screenshots/`
- **Cloud Storage**: Screenshots uploaded to Vercel Blob Storage

### Future Database Storage
See `activity_schema.sql` for complete database schema ready for implementation:
- PostgreSQL, SQLite, or MySQL compatible
- Includes indexes for performance
- JSONB fields for flexible data storage
- Foreign keys for data relationships

## Data Volume Estimates

- **Activity Logs**: ~1-2 KB per entry × 360 entries/hour = ~360-720 KB/hour
- **Screenshots**: ~500 KB per screenshot × 60 screenshots/hour = ~30 MB/hour
- **Daily Total**: ~10-15 MB activity logs + ~720 MB screenshots = ~730 MB/day
- **Monthly Total**: ~22 GB (mostly screenshots)

Recommendations:
- Compress screenshots if needed
- Store only recent activity logs (e.g., last 90 days)
- Use time-series database for efficiency
- Implement tiered storage (hot/warm/cold)

