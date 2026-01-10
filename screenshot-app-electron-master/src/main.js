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

// Function to trigger screenshot
function takeScreenshot() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const savePath = path.join(app.getPath('documents'), 'Screenshots');
    console.log('[MAIN] Triggering screenshot - Save path:', savePath);
    // Ensure directory exists from main process too
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
      console.log('[MAIN] Created directory:', savePath);
    }
    mainWindow.webContents.send('capture', savePath);
  } else {
    console.error('[MAIN] Cannot take screenshot - window not ready');
  }
}

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
