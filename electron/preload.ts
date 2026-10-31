import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface ElectronAPI {
  isElectron: boolean;
  setExpanded: (expanded: boolean) => Promise<void>;
  closeApp: () => Promise<void>;
  minimizeApp: () => Promise<void>;
  moveWindow?: (deltaX: number, deltaY: number) => Promise<void>;
  onForceCollapse?: (callback: () => void) => () => void;
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  setExpanded: (expanded: boolean) => ipcRenderer.invoke('set-expanded', expanded),
  closeApp: () => ipcRenderer.invoke('close-app'),
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
  onForceCollapse: (callback: () => void) => {
    const subscription = (_event: IpcRendererEvent) => callback();
    ipcRenderer.on('force-collapse', subscription);
    return () => {
      ipcRenderer.removeListener('force-collapse', subscription);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
