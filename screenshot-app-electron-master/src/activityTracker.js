const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Activity data structure
class ActivityTracker {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || 'http://localhost:8000/api/activity';
    this.collectionInterval = 10000; // Collect every 10 seconds
    this.idleThreshold = 60000; // 1 minute idle threshold
    this.lastActivityTime = Date.now();
    this.lastIdleCheck = Date.now();
    this.isCollecting = false;
    this.activityHistory = [];
    
    // System info (collected once)
    this.systemInfo = this.collectSystemInfo();
  }

  // Collect system information
  collectSystemInfo() {
    return {
      platform: os.platform(),
      platformVersion: os.release(),
      architecture: os.arch(),
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homeDirectory: os.userInfo().homedir,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8,
    };
  }

  // Get active window information (platform-specific)
  async getActiveWindow() {
    const platform = os.platform();
    
    try {
      if (platform === 'darwin') {
        // macOS - use AppleScript
        return await this.getActiveWindowMacOS();
      } else if (platform === 'win32') {
        // Windows - use PowerShell
        return await this.getActiveWindowWindows();
      } else if (platform === 'linux') {
        // Linux - use xdotool or similar
        return await this.getActiveWindowLinux();
      }
    } catch (error) {
      console.error('[ACTIVITY] Error getting active window:', error);
      return {
        appName: 'Unknown',
        windowTitle: 'Unknown',
        bundleId: null,
        processPath: null,
      };
    }
  }

  // macOS: Get active window using AppleScript
  async getActiveWindowMacOS() {
    // This requires native macOS permissions
    // For now, we'll use a simplified approach
    // In production, you might want to use a native module like 'active-win'
    try {
      
      // Get active app name
      const appScript = `
        tell application "System Events"
          set frontApp to name of first application process whose frontmost is true
        end tell
        return frontApp
      `;
      
      // Get window title
      const titleScript = `
        tell application "System Events"
          tell process frontApp
            set windowTitle to name of first window
          end tell
        end tell
        return windowTitle
      `;
      
      const appResult = await execAsync(`osascript -e '${appScript}'`);
      const appName = appResult.stdout.trim();
      
      // Try to get bundle ID
      let bundleId = null;
      try {
        const bundleScript = `
          tell application "System Events"
            set bundleID to bundle identifier of first application process whose frontmost is true
          end tell
          return bundleID
        `;
        const bundleResult = await execAsync(`osascript -e '${bundleScript}'`);
        bundleId = bundleResult.stdout.trim();
      } catch (e) {
        // Bundle ID might not be available
      }
      
      // Try to get window title (might fail for some apps)
      let windowTitle = 'Untitled';
      try {
        const titleResult = await execAsync(`osascript -e '${titleScript.replace('frontApp', `"${appName}"`)}'`);
        windowTitle = titleResult.stdout.trim() || 'Untitled';
      } catch (e) {
        windowTitle = appName;
      }
      
      return {
        appName,
        windowTitle,
        bundleId,
        processPath: null, // Would require more complex queries
      };
    } catch (error) {
      console.error('[ACTIVITY] macOS window detection error:', error);
      return {
        appName: 'Unknown',
        windowTitle: 'Unknown',
        bundleId: null,
        processPath: null,
      };
    }
  }

  // Windows: Get active window using PowerShell
  async getActiveWindowWindows() {
    try {
      
      const psScript = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class WindowInfo {
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
            public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
            [DllImport("user32.dll", SetLastError = true)]
            public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
          }
"@
        $hwnd = [WindowInfo]::GetForegroundWindow()
        $title = New-Object System.Text.StringBuilder 256
        [WindowInfo]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null
        $procId = 0
        [WindowInfo]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
        $proc = Get-Process -Id $procId
        Write-Output "$($proc.ProcessName)|$($title.ToString())|$($proc.Path)"
      `;
      
      const result = await execAsync(`powershell -Command "${psScript}"`);
      const parts = result.stdout.trim().split('|');
      
      return {
        appName: parts[0] || 'Unknown',
        windowTitle: parts[1] || 'Unknown',
        bundleId: null,
        processPath: parts[2] || null,
      };
    } catch (error) {
      console.error('[ACTIVITY] Windows window detection error:', error);
      return {
        appName: 'Unknown',
        windowTitle: 'Unknown',
        bundleId: null,
        processPath: null,
      };
    }
  }

  // Linux: Get active window using xdotool
  async getActiveWindowLinux() {
    try {
      
      // Get active window ID
      const windowIdResult = await execAsync('xdotool getactivewindow');
      const windowId = windowIdResult.stdout.trim();
      
      // Get window title
      const titleResult = await execAsync(`xdotool getwindowname ${windowId}`);
      const windowTitle = titleResult.stdout.trim();
      
      // Get process name
      const pidResult = await execAsync(`xdotool getwindowpid ${windowId}`);
      const pid = pidResult.stdout.trim();
      
      // Get process name from PID
      const processResult = await execAsync(`ps -p ${pid} -o comm=`);
      const appName = processResult.stdout.trim();
      
      return {
        appName: appName || 'Unknown',
        windowTitle: windowTitle || 'Unknown',
        bundleId: null,
        processPath: null,
      };
    } catch (error) {
      console.error('[ACTIVITY] Linux window detection error:', error);
      return {
        appName: 'Unknown',
        windowTitle: 'Unknown',
        bundleId: null,
        processPath: null,
      };
    }
  }

  // Get idle time (time since last user input)
  async getIdleTime() {
    const platform = os.platform();
    
    try {
      if (platform === 'darwin') {
        // macOS - use ioreg to get idle time
        const result = await execAsync('ioreg -c IOHIDSystem | awk \'/HIDIdleTime/ {print $NF/1000000000; exit}\'');
        return Math.floor(parseFloat(result.stdout.trim()));
      } else if (platform === 'win32') {
        // Windows - use GetLastInputInfo via PowerShell
        const psScript = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class IdleTime {
              [DllImport("user32.dll")]
              public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
              public struct LASTINPUTINFO {
                public uint cbSize;
                public uint dwTime;
              }
            }
"@
          $lastInput = New-Object IdleTime+LASTINPUTINFO
          $lastInput.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lastInput)
          [IdleTime]::GetLastInputInfo([ref]$lastInput) | Out-Null
          $idleTime = ([Environment]::TickCount - $lastInput.dwTime) / 1000
          Write-Output $idleTime
        `;
        const result = await execAsync(`powershell -Command "${psScript}"`);
        return Math.floor(parseFloat(result.stdout.trim()));
      } else if (platform === 'linux') {
        // Linux - use xprintidle (needs to be installed: sudo apt-get install xprintidle)
        const result = await execAsync('xprintidle');
        return Math.floor(parseInt(result.stdout.trim()) / 1000); // Convert ms to seconds
      }
    } catch (error) {
      console.error('[ACTIVITY] Error getting idle time:', error);
      return 0;
    }
    
    return 0;
  }

  // Collect app_name only (simplified)
  async collectActivity() {
    if (this.isCollecting) return null; // Prevent concurrent collections
    this.isCollecting = true;
    
    try {
      const activeWindow = await this.getActiveWindow();
      const appName = activeWindow.appName || 'Unknown';
      
      // Only return if app_name changed (for episode tracking)
      const lastAppName = this.activityHistory.length > 0 
        ? this.activityHistory[this.activityHistory.length - 1].appName 
        : null;
      
      if (appName !== lastAppName) {
        const activityData = {
          appName: appName,
          windowTitle: activeWindow.windowTitle || null,
        };
        
        this.activityHistory.push(activityData);
        
        // Keep only last 50 entries in memory
        if (this.activityHistory.length > 50) {
          this.activityHistory.shift();
        }
        
        return activityData;
      }
      
      return null; // No change, don't send
    } catch (error) {
      console.error('[ACTIVITY] Error collecting activity:', error);
      return null;
    } finally {
      this.isCollecting = false;
    }
  }

  // Send app_name change to server (for episode tracking)
  async sendActivityToServer(activityData) {
    if (!this.serverUrl || !activityData || !activityData.appName) return;
    
    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appName: activityData.appName,
          windowTitle: activityData.windowTitle || null,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('[ACTIVITY] App change sent successfully:', activityData.appName);
      return result;
    } catch (error) {
      console.error('[ACTIVITY] Error sending activity to server:', error);
      return null;
    }
  }
  
  // Get current active window (for use by capture.js)
  async getCurrentWindow() {
    try {
      const activeWindow = await this.getActiveWindow();
      return {
        appName: activeWindow.appName || 'Unknown',
        windowTitle: activeWindow.windowTitle || null,
      };
    } catch (error) {
      console.error('[ACTIVITY] Error getting current window:', error);
      return {
        appName: 'Unknown',
        windowTitle: null,
      };
    }
  }

  // Start continuous collection
  start() {
    console.log('[ACTIVITY] Starting activity tracker...');
    console.log('[ACTIVITY] Collection interval:', this.collectionInterval, 'ms');
    console.log('[ACTIVITY] Server URL:', this.serverUrl);
    
    // Collect immediately
    this.collectAndSend();
    
    // Set up interval for periodic collection
    this.intervalId = setInterval(async () => {
      await this.collectAndSend();
    }, this.collectionInterval);
    
    // Also collect on window focus/blur events if available (renderer process)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.lastActivityTime = Date.now();
        this.collectAndSend();
      });
      
      window.addEventListener('blur', () => {
        this.collectAndSend();
      });
    }
  }

  // Collect and send activity (only if app_name changed)
  async collectAndSend() {
    const activityData = await this.collectActivity();
    if (activityData && activityData.appName) {
      // Only send if app_name actually changed
      await this.sendActivityToServer(activityData);
    }
  }

  // Stop collection
  stop() {
    console.log('[ACTIVITY] Stopping activity tracker...');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Get activity history
  getHistory() {
    return this.activityHistory;
  }

  // Clear history
  clearHistory() {
    this.activityHistory = [];
  }
}

module.exports = ActivityTracker;

