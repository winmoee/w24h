const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { ipcRenderer: ipc } = electron;

// Helper to log to both console and main process
function logToMain(level, ...args) {
  console.log(`[RENDERER] ${level}:`, ...args);
  ipc.send('renderer-log', level, ...args);
}

// Helper to convert Buffer to File object for Vercel Blob upload
function bufferToFile(buffer, filename, mimeType = 'image/png') {
  // In Electron renderer (Chromium), File and Blob are available
  // Convert Node.js Buffer to Uint8Array for Blob/File
  const uint8Array = new Uint8Array(buffer);
  const blob = new Blob([uint8Array], { type: mimeType });
  // File constructor is available in Electron renderer
  return new File([blob], filename, { 
    type: mimeType, 
    lastModified: Date.now() 
  });
}

// Upload screenshot to backend (which uploads to Vercel Blob and stores in MongoDB)
async function uploadScreenshotToVercel(pngBuffer, filename, localPath, uploadUrl, appName, windowTitle) {
  if (!uploadUrl) {
    logToMain('WARN', 'No upload URL configured, skipping upload');
    return null;
  }

  try {
    logToMain('INFO', 'Creating FormData for upload...');
    
    // Convert Buffer to File for FormData
    const file = bufferToFile(pngBuffer, filename, 'image/png');
    
    // Create FormData to send file to backend
    const formData = new FormData();
    formData.append('file', file, filename);
    
    // Optional: specify pathname
    const timestamp = Date.now();
    const pathname = `screenshots/${timestamp}-${filename}`;
    formData.append('pathname', pathname);
    
    // Send app_name and window_title for episode tracking
    if (appName) {
      formData.append('app_name', appName);
    }
    if (windowTitle) {
      formData.append('window_title', windowTitle);
    }
    if (localPath) {
      formData.append('local_path', localPath);
    }
    
    logToMain('INFO', 'Uploading file to backend:', filename);
    logToMain('INFO', 'File size:', pngBuffer.length, 'bytes');
    logToMain('INFO', 'App name:', appName);
    logToMain('INFO', 'Window title:', windowTitle || 'N/A');
    logToMain('INFO', 'Local path:', localPath);
    
    // Upload to Python backend
    logToMain('INFO', 'Sending POST request to backend...');
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    
    logToMain('INFO', 'Response received - Status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      logToMain('ERROR', 'Upload failed with status:', response.status);
      logToMain('ERROR', 'Error response:', errorText);
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    logToMain('SUCCESS', 'Screenshot uploaded and stored successfully!');
    logToMain('INFO', 'Frame ID:', result.frame_id);
    logToMain('INFO', 'Episode ID:', result.episode_id);
    logToMain('INFO', 'Blob URL:', result.url || 'N/A');
    
    return result;
  } catch (err) {
    logToMain('ERROR', 'Failed to upload to backend:', err.message);
    if (err.stack) {
      logToMain('ERROR', 'Stack trace:', err.stack);
    }
    // Don't throw - allow local save to succeed even if upload fails
    return null;
  }
}

function ensureDirectoryExists(dirPath) {
  console.log('[RENDERER] Checking directory:', dirPath);
  try {
    if (!fs.existsSync(dirPath)) {
      console.log('[RENDERER] Directory does not exist, creating...');
      fs.mkdirSync(dirPath, { recursive: true });
      console.log('[RENDERER] ✓ Directory created:', dirPath);
    } else {
      console.log('[RENDERER] ✓ Directory already exists');
    }
    
    // Verify we can write to the directory
    try {
      const testFile = path.join(dirPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log('[RENDERER] ✓ Directory is writable');
    } catch (writeErr) {
      console.error('[RENDERER] ✗ Directory is NOT writable:', writeErr);
      throw new Error('Cannot write to directory: ' + writeErr.message);
    }
  } catch (err) {
    console.error('[RENDERER] Directory check/creation failed:', err);
    throw err;
  }
}

function writeScreenshot(png, filePath) {
  return new Promise((resolve, reject) => {
    console.log('[RENDERER] Writing screenshot to:', filePath);
    console.log('[RENDERER] PNG buffer size:', png ? png.length : 'null', 'bytes');
    
    if (!png || png.length === 0) {
      const error = 'PNG buffer is empty or invalid';
      console.error('[RENDERER] ✗', error);
      ipc.send('screenshot-saved', filePath, false, error);
      reject(new Error(error));
      return;
    }
    
    fs.writeFile(filePath, png, (err) => {
      if (err) {
        console.error('[RENDERER] ✗ Failed to save image:', err);
        console.error('[RENDERER] Error details:', err.code, err.message, err.path);
        ipc.send('screenshot-saved', filePath, false, err.message);
        reject(err);
      } else {
        console.log('[RENDERER] ✓ File write completed:', filePath);
        // Verify file was actually written
        try {
          const stats = fs.statSync(filePath);
          console.log('[RENDERER] ✓ File exists, size:', stats.size, 'bytes');
          if (stats.size === 0) {
            throw new Error('File was created but is empty (0 bytes)');
          }
          ipc.send('screenshot-saved', filePath, true, null);
          resolve(filePath);
        } catch (verifyErr) {
          console.error('[RENDERER] ✗ File verification failed:', verifyErr);
          ipc.send('screenshot-saved', filePath, false, 'File write succeeded but verification failed: ' + verifyErr.message);
          reject(verifyErr);
        }
      }
    });
  });
}

function formatDateForFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

async function onCapture(evt, targetPath, uploadUrl = null) {
  logToMain('INFO', '========================================');
  logToMain('INFO', 'CAPTURE REQUESTED');
  logToMain('INFO', 'Target path:', targetPath);
  logToMain('INFO', 'Upload URL:', uploadUrl || 'Not configured');
  logToMain('INFO', 'Upload URL type:', typeof uploadUrl);
  logToMain('INFO', '========================================');
  
  try {
    // Step 1: Ensure the directory exists
    console.log('[RENDERER] Step 1: Ensuring directory exists...');
    ensureDirectoryExists(targetPath);
    
    // Step 2: Get screen info from main process via IPC
    console.log('[RENDERER] Step 2: Getting screen info from main process...');
    const screenSize = await ipc.invoke('get-screen-info');
    console.log('[RENDERER] Received screen size:', screenSize);
    
    // Step 3: Get screen source from main process (where desktopCapturer is available)
    console.log('[RENDERER] Step 3: Requesting screen capture from main process...');
    const result = await ipc.invoke('capture-screen-source', screenSize);
    
    if (!result.success) {
      const error = result.error || 'Failed to capture screen source';
      console.error('[RENDERER] ✗', error);
      ipc.send('screenshot-saved', null, false, error);
      return;
    }
    
    const pngBase64 = result.pngBase64;
    console.log('[RENDERER] Step 4: Received PNG base64 from main process, length:', pngBase64 ? pngBase64.length : 'null');
    
    if (!pngBase64 || pngBase64.length === 0) {
      const error = 'PNG data is empty or invalid';
      console.error('[RENDERER] ✗', error);
      ipc.send('screenshot-saved', null, false, error);
      return;
    }
    
    // Convert base64 back to Buffer
    const png = Buffer.from(pngBase64, 'base64');
    console.log('[RENDERER] PNG buffer created from base64, length:', png ? png.length : 'null', 'bytes');
    
    // Step 5: Generate filename and full path
    console.log('[RENDERER] Step 5: Generating filename...');
    const filename = `screenshot_${formatDateForFilename()}.png`;
    const filePath = path.join(targetPath, filename);
    console.log('[RENDERER] Full file path:', filePath);
    
    // Step 6: Write file locally
    console.log('[RENDERER] Step 6: Writing file locally...');
    await writeScreenshot(png, filePath);
    
    // Step 7: Get current app_name for episode tracking
    let appName = 'Unknown';
    let windowTitle = null;
    try {
      const windowInfo = await getCurrentWindowInfo();
      if (windowInfo && windowInfo.appName) {
        appName = windowInfo.appName;
        windowTitle = windowInfo.windowTitle || null;
      }
      logToMain('INFO', 'Active app:', appName, 'Window:', windowTitle || 'N/A');
    } catch (err) {
      console.warn('[RENDERER] Could not get active window info:', err.message);
    }
    
    // Step 8: Upload to backend (non-blocking, don't wait)
    if (uploadUrl && uploadUrl !== 'null' && uploadUrl !== 'undefined' && uploadUrl !== null && uploadUrl !== undefined) {
      logToMain('INFO', 'Step 8: Starting upload to backend...');
      logToMain('INFO', 'Upload URL:', uploadUrl);
      logToMain('INFO', 'App name:', appName);
      logToMain('INFO', 'Window title:', windowTitle || 'N/A');
      logToMain('INFO', 'File size:', png.length, 'bytes');
      
      uploadScreenshotToVercel(png, filename, filePath, uploadUrl, appName, windowTitle)
        .then((result) => {
          if (result && result.success) {
            logToMain('SUCCESS', 'Upload completed - Frame ID:', result.frame_id);
            logToMain('SUCCESS', 'Episode ID:', result.episode_id);
            logToMain('SUCCESS', 'Blob URL:', result.url || 'N/A');
            // Notify main process of successful upload
            ipc.send('screenshot-uploaded', filePath, result.url || null);
          } else {
            logToMain('WARN', 'Upload returned unsuccessful result');
          }
        })
        .catch((uploadErr) => {
          logToMain('ERROR', 'Upload error:', uploadErr.message);
          logToMain('ERROR', 'Upload error details:', uploadErr.toString());
          if (uploadErr.stack) {
            logToMain('ERROR', 'Stack:', uploadErr.stack);
          }
        });
    } else {
      logToMain('WARN', 'Skipping upload - Upload URL not configured');
    }
    
    console.log('[RENDERER] ========================================');
    console.log('[RENDERER] ✓ CAPTURE COMPLETED SUCCESSFULLY');
    console.log('[RENDERER] ========================================');
  } catch (err) {
    console.error('[RENDERER] ========================================');
    console.error('[RENDERER] ✗ CAPTURE FAILED');
    console.error('[RENDERER] Error:', err);
    console.error('[RENDERER] Stack:', err.stack);
    console.error('[RENDERER] ========================================');
    ipc.send('screenshot-saved', null, false, err.message);
  }
}

ipc.on('capture', onCapture);

// Initialize activity tracker when requested from main process
let activityTracker = null;
ipc.on('init-activity-tracker', (evt, serverUrl) => {
  try {
    const ActivityTracker = require('./activityTracker');
    activityTracker = new ActivityTracker(serverUrl);
    activityTracker.start();
    logToMain('INFO', 'Activity tracker started with server:', serverUrl);
  } catch (error) {
    logToMain('ERROR', 'Failed to initialize activity tracker:', error.message);
    console.error('[RENDERER] Activity tracker error:', error);
  }
});

// Helper to get current window info (from activity tracker or IPC)
async function getCurrentWindowInfo() {
  // Try to use activity tracker first
  if (activityTracker && typeof activityTracker.getCurrentWindow === 'function') {
    try {
      return await activityTracker.getCurrentWindow();
    } catch (err) {
      console.warn('[RENDERER] Activity tracker getCurrentWindow failed:', err);
    }
  }
  
  // Fallback to IPC
  try {
    return await ipc.invoke('get-active-window');
  } catch (err) {
    console.warn('[RENDERER] IPC get-active-window failed:', err);
    return { appName: 'Unknown', windowTitle: null };
  }
}
