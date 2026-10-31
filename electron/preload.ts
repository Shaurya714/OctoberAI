import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface ScreenCaptureResult {
  success: boolean;
  image?: string;
  sourceName?: string;
  resolution?: string;
  activeApp?: string;
  activeAppIcon?: string;
  windowTitle?: string;
  timestamp: string;
  error?: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  setExpanded: (expanded: boolean) => Promise<void>;
  setAppMode?: (mode: 'collapsed' | 'chat' | 'screen') => Promise<void>;
  closeApp: () => Promise<void>;
  minimizeApp: () => Promise<void>;
  moveWindow?: (deltaX: number, deltaY: number) => Promise<void>;
  onForceCollapse?: (callback: () => void) => () => void;
  captureScreen?: () => Promise<ScreenCaptureResult>;
  getDesktopSources?: () => Promise<Array<{ id: string; name: string }>>;
  setIgnoreMouseEvents?: (ignore: boolean, options?: { forward?: boolean }) => Promise<void>;
  getActiveWindow?: () => Promise<{ appName: string; windowTitle: string }>;
  onActiveWindowUpdated?: (callback: (data: { appName: string; windowTitle: string }) => void) => () => void;
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  setExpanded: (expanded: boolean) => ipcRenderer.invoke('set-expanded', expanded),
  setAppMode: (mode: 'collapsed' | 'chat' | 'screen') => ipcRenderer.invoke('set-app-mode', mode),
  closeApp: () => ipcRenderer.invoke('close-app'),
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) =>
    ipcRenderer.invoke('set-ignore-mouse-events', ignore, options),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  onActiveWindowUpdated: (callback: (data: { appName: string; windowTitle: string }) => void) => {
    const subscription = (_event: IpcRendererEvent, data: { appName: string; windowTitle: string }) => callback(data);
    ipcRenderer.on('active-window-updated', subscription);
    return () => {
      ipcRenderer.removeListener('active-window-updated', subscription);
    };
  },
  onForceCollapse: (callback: () => void) => {
    const subscription = (_event: IpcRendererEvent) => callback();
    ipcRenderer.on('force-collapse', subscription);
    return () => {
      ipcRenderer.removeListener('force-collapse', subscription);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
