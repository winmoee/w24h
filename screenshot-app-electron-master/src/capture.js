const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { ipcRenderer: ipc } = electron;

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

async function onCapture(evt, targetPath) {
  console.log('[RENDERER] ========================================');
  console.log('[RENDERER] CAPTURE REQUESTED');
  console.log('[RENDERER] Target path:', targetPath);
  console.log('[RENDERER] ========================================');
  
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
    
    // Step 6: Write file
    console.log('[RENDERER] Step 6: Writing file...');
    await writeScreenshot(png, filePath);
    
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
