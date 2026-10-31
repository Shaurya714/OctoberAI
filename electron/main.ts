import { app, BrowserWindow, ipcMain, screen, desktopCapturer } from 'electron';
import * as path from 'path';
import { spawn, execFile } from 'child_process';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

const COLLAPSED_SIZE = 84;
const EXPANDED_WIDTH = 380;
const EXPANDED_HEIGHT = 580;
const MARGIN_RIGHT = 32;
const MARGIN_TOP = 64;

let currentMode: 'collapsed' | 'chat' | 'screen' = 'collapsed';
let savedChatBounds: Electron.Rectangle | null = null;
let activeWindowWatcherProcess: any = null;

function getActiveWindowExePath(): string | null {
  const possiblePaths = [
    path.join(__dirname, 'ActiveWindow.exe'),
    path.join(__dirname, '../dist-electron/ActiveWindow.exe'),
    path.resolve('dist-electron/ActiveWindow.exe'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getActiveWindowInfo(): Promise<{ appName: string; windowTitle: string }> {
  return new Promise((resolve) => {
    const exePath = getActiveWindowExePath();
    if (exePath && process.platform === 'win32') {
      execFile(exePath, [], { timeout: 1200 }, (err, stdout) => {
        if (!err && stdout) {
          try {
            const data = JSON.parse(stdout.trim());
            return resolve({
              appName: data.appName || 'Desktop Environment',
              windowTitle: data.windowTitle || '',
            });
          } catch {}
        }
        resolveFallbackActiveWindow(resolve);
      });
    } else {
      resolveFallbackActiveWindow(resolve);
    }
  });
}

async function resolveFallbackActiveWindow(resolve: (val: { appName: string; windowTitle: string }) => void) {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    const external = sources.find(
      (s) => s.id.startsWith('window:') && !s.name.toLowerCase().includes('october')
    );
    resolve({
      appName: external ? external.name : 'Desktop Environment',
      windowTitle: external ? external.name : '',
    });
  } catch {
    resolve({ appName: 'Desktop Environment', windowTitle: '' });
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  const initialX = Math.round(workArea.x + workArea.width - COLLAPSED_SIZE - MARGIN_RIGHT);
  const initialY = Math.round(workArea.y + MARGIN_TOP);

  mainWindow = new BrowserWindow({
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Always keep on top as a floating companion
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    if (activeWindowWatcherProcess) {
      try { activeWindowWatcherProcess.kill(); } catch {}
      activeWindowWatcherProcess = null;
    }
    mainWindow = null;
  });
}

function applyWindowMode(mode: 'collapsed' | 'chat' | 'screen') {
  if (!mainWindow) return;
  const previousMode = currentMode;
  currentMode = mode;

  if (mode === 'screen') {
    // Save current chat position to restore on exit
    if (previousMode === 'chat') {
      savedChatBounds = mainWindow.getBounds();
    }

    const currentBounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(currentBounds);
    const workArea = display.workArea;

    // Expand window to cover the complete work area (desktop visibility via transparent background)
    mainWindow.setBounds({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
    });

    // Default to click-through on transparent areas while Screen Mode is active
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    // Start background watcher if available
    startActiveWindowWatcher();
  } else {
    // Collapsed or Chat mode
    stopActiveWindowWatcher();
    mainWindow.setIgnoreMouseEvents(false);

    let targetWidth = COLLAPSED_SIZE;
    let targetHeight = COLLAPSED_SIZE;

    if (mode === 'chat') {
      targetWidth = EXPANDED_WIDTH;
      targetHeight = EXPANDED_HEIGHT;

      if (savedChatBounds) {
        mainWindow.setBounds(savedChatBounds);
        return;
      }
    }

    const currentBounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(currentBounds);
    const workArea = display.workArea;

    targetWidth = Math.min(targetWidth, workArea.width - 24);
    targetHeight = Math.min(targetHeight, workArea.height - 24);

    // Center horizontally under previous position
    const coreCenterX = currentBounds.x + currentBounds.width / 2;
    let newX = Math.round(coreCenterX - targetWidth / 2);
    let newY = Math.round(currentBounds.y);

    // Clamp within display work area
    if (newX < workArea.x + 12) {
      newX = workArea.x + 12;
    }
    if (newX + targetWidth > workArea.x + workArea.width - 12) {
      newX = workArea.x + workArea.width - targetWidth - 12;
    }
    if (newY + targetHeight > workArea.y + workArea.height - 12) {
      newY = Math.max(workArea.y + 12, workArea.y + workArea.height - targetHeight - 12);
    }
    if (newY < workArea.y + 12) {
      newY = workArea.y + 12;
    }

    mainWindow.setBounds({
      x: Math.round(newX),
      y: Math.round(newY),
      width: targetWidth,
      height: targetHeight,
    });
  }
}

function startActiveWindowWatcher() {
  if (activeWindowWatcherProcess) return;
  const exePath = getActiveWindowExePath();
  if (exePath && process.platform === 'win32') {
    try {
      activeWindowWatcherProcess = spawn(exePath, ['watch'], { stdio: ['ignore', 'pipe', 'ignore'] });
      activeWindowWatcherProcess.stdout.on('data', (data: Buffer) => {
        const text = data.toString('utf8').trim();
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('active-window-updated', parsed);
              }
            } catch {}
          }
        }
      });
      activeWindowWatcherProcess.on('error', () => {
        activeWindowWatcherProcess = null;
      });
      activeWindowWatcherProcess.on('close', () => {
        activeWindowWatcherProcess = null;
      });
    } catch {
      activeWindowWatcherProcess = null;
    }
  }
}

function stopActiveWindowWatcher() {
  if (activeWindowWatcherProcess) {
    try {
      activeWindowWatcherProcess.kill();
    } catch {}
    activeWindowWatcherProcess = null;
  }
}

// IPC Handlers
ipcMain.handle('set-expanded', (_event, expand: boolean) => {
  applyWindowMode(expand ? 'chat' : 'collapsed');
});

ipcMain.handle('set-app-mode', (_event, mode: 'collapsed' | 'chat' | 'screen') => {
  applyWindowMode(mode);
});

ipcMain.handle('set-ignore-mouse-events', (_event, ignore: boolean, options?: { forward?: boolean }) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(ignore, options);
});

ipcMain.handle('get-active-window', async () => {
  return await getActiveWindowInfo();
});

ipcMain.handle('move-window', (_event, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
  if (!mainWindow || currentMode === 'screen') return;
  const [currentX, currentY] = mainWindow.getPosition();
  mainWindow.setPosition(Math.round(currentX + deltaX), Math.round(currentY + deltaY));
});

ipcMain.handle('close-app', () => {
  stopActiveWindowWatcher();
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('minimize-app', () => {
  if (mainWindow) {
    if (currentMode !== 'collapsed') {
      mainWindow.webContents.send('force-collapse');
    } else {
      mainWindow.minimize();
    }
  }
});

// Screen Awareness Native Capture (Optimised lightweight thumbnail + info)
ipcMain.handle('capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 640, height: 360 },
      fetchWindowIcons: false,
    });

    const screenSource = sources[0];
    const primaryDisplay = screen.getPrimaryDisplay();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (!screenSource) {
      return {
        success: false,
        error: 'No active display was found for desktop capture.',
        timestamp: now,
      };
    }

    const activeInfo = await getActiveWindowInfo();

    return {
      success: true,
      image: screenSource.thumbnail.toDataURL(),
      sourceName: screenSource.name || 'Primary Display',
      resolution: `${primaryDisplay.bounds.width} × ${primaryDisplay.bounds.height}`,
      activeApp: activeInfo.appName,
      windowTitle: activeInfo.windowTitle,
      timestamp: now,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to capture desktop screen.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }
});

// Desktop Sources query for System Audio & Video Screen Capture
ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch {
    return [];
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopActiveWindowWatcher();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
