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

export interface ElectronAPI {
  isElectron: boolean;
  setExpanded: (expanded: boolean) => Promise<void>;
  closeApp: () => Promise<void>;
  minimizeApp: () => Promise<void>;
  moveWindow?: (deltaX: number, deltaY: number) => Promise<void>;
  onForceCollapse?: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
