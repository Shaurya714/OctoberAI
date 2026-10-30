import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

const PILL_WIDTH = 200;
const PILL_HEIGHT = 48;
const EXPANDED_WIDTH = 360;
const EXPANDED_HEIGHT = 520;
const MARGIN_RIGHT = 24;
const MARGIN_TOP = 64;

let isExpanded = false;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  const initialX = Math.round(workArea.x + workArea.width - PILL_WIDTH - MARGIN_RIGHT);
  const initialY = Math.round(workArea.y + MARGIN_TOP);

  mainWindow = new BrowserWindow({
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
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
  mainWindow.setAlwaysOnTop(true);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('set-expanded', (_event, expand: boolean) => {
  if (!mainWindow || isExpanded === expand) return;
  isExpanded = expand;

  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;

  const targetWidth = expand ? EXPANDED_WIDTH : PILL_WIDTH;
  const targetHeight = expand ? EXPANDED_HEIGHT : PILL_HEIGHT;

  // Anchor right edge so expanding expands leftward, and collapsing shrinks rightward
  const rightEdge = currentBounds.x + currentBounds.width;
  let newX = rightEdge - targetWidth;
  let newY = currentBounds.y;

  // Clamp within work area bounds
  if (newX < workArea.x + 12) {
    newX = workArea.x + 12;
  }
  if (newX + targetWidth > workArea.x + workArea.width) {
    newX = workArea.x + workArea.width - targetWidth - 12;
  }
  if (newY + targetHeight > workArea.y + workArea.height) {
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
});

ipcMain.handle('close-app', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('minimize-app', () => {
  if (mainWindow) {
    // If expanded, collapse back to pill. If already pill, minimize window.
    if (isExpanded) {
      mainWindow.webContents.send('force-collapse');
    } else {
      mainWindow.minimize();
    }
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
