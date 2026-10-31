/// <reference types="vite/client" />

export interface Message {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  model?: string;
  isError?: boolean;
}

export type CompanionStatus = 'ready' | 'idle' | 'busy';

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

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
