const electron = require('electron');
const path = require('path');
const fs = require('fs');

const { app, BrowserWindow, globalShortcut, ipcMain, screen, desktopCapturer } = electron;

let mainWindow;
let screenshotInterval;

// Handle screen source capture from renderer - moved to main process
ipcMain.handle('capture-screen-source', async (event, screenSize) => {
  console.log('[MAIN] Capturing screen source with size:', screenSize);
  try {
    const options = {
      types: ['screen'],
      thumbnailSize: screenSize
    };
    
    console.log('[MAIN] Requesting sources with options:', JSON.stringify(options));
    const sources = await desktopCapturer.getSources(options);
    console.log('[MAIN] Found', sources.length, 'source(s)');
    
    sources.forEach((source, index) => {
      console.log(`[MAIN] Source ${index}: name="${source.name}", id="${source.id}", display_id="${source.display_id}"`);
    });
    
    // Find main source
    const isMainSource = s => {
      const name = s.name.toLowerCase();
      return name.includes('entire screen') ||
             name.includes('screen 1') ||
             name.includes('main') ||
             s.display_id === '0:0';
    };
    
    let mainSource = sources.find(isMainSource);
    if (!mainSource && sources.length > 0) {
      mainSource = sources[0];
      console.log('[MAIN] No matching source found, using first available:', mainSource.name);
    }
    
    if (mainSource) {
      console.log('[MAIN] Selected source:', mainSource.name, 'with id:', mainSource.id);
      // Convert thumbnail to PNG buffer in main process
      const png = mainSource.thumbnail.toPNG();
      console.log('[MAIN] PNG buffer created, length:', png ? png.length : 'null', 'bytes');
      // Convert Buffer to base64 for IPC transmission (safer)
      const pngBase64 = png.toString('base64');
      console.log('[MAIN] PNG converted to base64, length:', pngBase64.length);
      return {
        success: true,
        pngBase64: pngBase64,
        sourceName: mainSource.name
      };
    } else {
      console.error('[MAIN] No source found!');
      return {
        success: false,
        error: 'No screen source found'
      };
    }
  } catch (err) {
    console.error('[MAIN] Error capturing screen source:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// Handle screen info request from renderer
ipcMain.handle('get-screen-info', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const size = primaryDisplay.size;
  console.log('[MAIN] Screen info requested - Size:', size, 'WorkArea:', primaryDisplay.workAreaSize);
  return size; // Use actual display size, not work area
});

// Handle active window info request from renderer (for episode tracking)
ipcMain.handle('get-active-window', async () => {
  try {
    // Get active window using desktopCapturer or platform-specific methods
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS - use AppleScript
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        const appScript = `
          tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
          end tell
          return frontApp
        `;
        const appResult = await execAsync(`osascript -e '${appScript}'`);
        const appName = appResult.stdout.trim();
        
        // Try to get window title
        let windowTitle = null;
        try {
          const titleScript = `
            tell application "System Events"
              tell process "${appName}"
                set windowTitle to name of first window
              end tell
            end tell
            return windowTitle
          `;
          const titleResult = await execAsync(`osascript -e '${titleScript}'`);
          windowTitle = titleResult.stdout.trim() || null;
        } catch (e) {
          // Window title might not be available
        }
        
        return {
          appName: appName || 'Unknown',
          windowTitle: windowTitle,
        };
      } catch (err) {
        console.error('[MAIN] macOS window detection error:', err);
        return { appName: 'Unknown', windowTitle: null };
      }
    } else {
      // Windows/Linux - placeholder for now
      return {
        appName: 'Unknown',
        windowTitle: null,
      };
    }
  } catch (err) {
    console.error('[MAIN] Error getting active window:', err);
    return {
      appName: 'Unknown',
      windowTitle: null,
    };
  }
});

// Handle screenshot save confirmation from renderer
ipcMain.on('screenshot-saved', (event, filePath, success, error) => {
  if (success) {
    console.log('[MAIN] ✓ Screenshot successfully saved to:', filePath);
    // Verify file exists
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log('[MAIN] ✓ File verified - Size:', stats.size, 'bytes');
    } else {
      console.error('[MAIN] ✗ ERROR: File was reported saved but does not exist:', filePath);
    }
  } else {
    console.error('[MAIN] ✗ Screenshot save failed:', error);
  }
});

// Configuration for Vercel Blob upload via Python backend
// Set this to your Python backend URL or leave null to disable uploads
// You can set it via environment variable: VERCEL_BLOB_UPLOAD_URL=http://localhost:8000/api/screenshot-upload
// Default to localhost:8000 in development (when NODE_ENV is not 'production')
const VERCEL_BLOB_UPLOAD_URL = process.env.VERCEL_BLOB_UPLOAD_URL || 
                                 (process.env.NODE_ENV !== 'production' ? 'http://localhost:8000/api/screenshot-upload' : null);

// Function to trigger screenshot
function takeScreenshot() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const savePath = path.join(app.getPath('documents'), 'Screenshots');
    console.log('[MAIN] Triggering screenshot - Save path:', savePath);
    console.log('[MAIN] Upload URL being sent to renderer:', VERCEL_BLOB_UPLOAD_URL || 'null');
    // Ensure directory exists from main process too
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
      console.log('[MAIN] Created directory:', savePath);
    }
    // Send both save path and upload URL to renderer
    mainWindow.webContents.send('capture', savePath, VERCEL_BLOB_UPLOAD_URL);
  } else {
    console.error('[MAIN] Cannot take screenshot - window not ready');
  }
}

// Handle screenshot upload confirmation from renderer
ipcMain.on('screenshot-uploaded', (event, localPath, blobUrl) => {
  console.log('[MAIN] ✓ Screenshot uploaded to Vercel Blob');
  console.log('[MAIN] Local path:', localPath);
  console.log('[MAIN] Blob URL:', blobUrl);
  // TODO: Store blob URL in your database, link to user, etc.
});

// Forward renderer console logs to main process for visibility
ipcMain.on('renderer-log', (event, level, ...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  console.log(`[RENDERER-${level}] ${message}`);
});

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: true,
    resizable: false,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  // Open dev tools for debugging - so we can see console logs
  mainWindow.webContents.openDevTools();

  mainWindow.loadURL(`file://${__dirname}/capture.html`);

  mainWindow.on('close', () => {
    if (screenshotInterval) {
      clearInterval(screenshotInterval);
    }
    mainWindow = null;
  });

  // Start automatic screenshots every 1 minute (60000 ms)
  screenshotInterval = setInterval(() => {
    takeScreenshot();
  }, 60000);

  // Take first screenshot after 1 second delay
  setTimeout(() => {
    takeScreenshot();
  }, 1000);

  // Optional: Keep keyboard shortcut for manual capture
  globalShortcut.register('CommandOrControl+Y', () => {
    console.log('Manual capture triggered');
    takeScreenshot();
  });

  console.log('Screenshot app started. Taking screenshots every 1 minute...');
  console.log('Screenshots will be saved to:', path.join(app.getPath('documents'), 'Screenshots'));
  console.log('[MAIN] Upload URL configured:', VERCEL_BLOB_UPLOAD_URL || 'DISABLED');
  if (!VERCEL_BLOB_UPLOAD_URL) {
    console.log('[MAIN] Upload is disabled. To enable, set VERCEL_BLOB_UPLOAD_URL environment variable or edit main.js');
  }

  // Send activity server URL to renderer
  const activityServerUrl = process.env.ACTIVITY_SERVER_URL || 'http://localhost:8000/api/activity';
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('init-activity-tracker', activityServerUrl);
    console.log('[MAIN] Activity tracker initialized with server:', activityServerUrl);
  });
});

// Handle app lifecycle
app.on('window-all-closed', () => {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    // Window creation code would go here if needed
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }
});
