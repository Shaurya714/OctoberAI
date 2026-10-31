import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

const COLLAPSED_SIZE = 84;
const EXPANDED_WIDTH = 380;
const EXPANDED_HEIGHT = 580;
const MARGIN_RIGHT = 32;
const MARGIN_TOP = 64;

let isExpanded = false;

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

  const targetWidth = expand ? EXPANDED_WIDTH : COLLAPSED_SIZE;
  const targetHeight = expand ? EXPANDED_HEIGHT : COLLAPSED_SIZE;

  let newX: number;
  let newY: number;

  if (expand) {
    // Center the expanded window horizontally under the neural core's current center
    const coreCenterX = currentBounds.x + currentBounds.width / 2;
    newX = Math.round(coreCenterX - targetWidth / 2);
    newY = Math.round(currentBounds.y);
  } else {
    // Restore collapsed window centered at the neural core's position in expanded window
    const coreCenterX = currentBounds.x + currentBounds.width / 2;
    newX = Math.round(coreCenterX - targetWidth / 2);
    newY = Math.round(currentBounds.y);
  }

  // Clamp within work area bounds
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
});

ipcMain.handle('move-window', (_event, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
  if (!mainWindow) return;
  const [currentX, currentY] = mainWindow.getPosition();
  mainWindow.setPosition(Math.round(currentX + deltaX), Math.round(currentY + deltaY));
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
