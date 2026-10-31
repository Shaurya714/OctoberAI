import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NeuralTheme } from '../theme';
import { ScreenCornerIndicators } from './ScreenCornerIndicators';
import { ClusterExpansionTransition } from './ClusterExpansionTransition';
import { screenCaptureService } from '../services/screenCapture';
import {
  ScreenIcon,
  AppWindowIcon,
  ScanEyeIcon,
  RefreshIcon,
  SettingsIcon,
  ExitIcon,
  LoadingSpinnerIcon,
} from './Icons';

interface ScreenAwarenessProps {
  theme: NeuralTheme;
  onExit: () => void;
  onClose: () => void;
}

interface ActiveWindowData {
  appName: string;
  windowTitle: string;
}

export const ScreenAwareness: React.FC<ScreenAwarenessProps> = ({
  theme,
  onExit,
  onClose: _onClose,
}) => {
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isTaskbarHovered, setIsTaskbarHovered] = useState(false);
  const [activeWindow, setActiveWindow] = useState<ActiveWindowData>({
    appName: 'Detecting context...',
    windowTitle: '',
  });
  const [screenResolution, setScreenResolution] = useState<string>('—');
  const [lastFrameTime, setLastFrameTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Initial screen capture stream setup
  useEffect(() => {
    let isMounted = true;
    setScreenResolution(`${window.screen.width} × ${window.screen.height}`);

    const initCapture = async () => {
      const stream = await screenCaptureService.start({
        onStreamReady: (s) => {
          if (!isMounted) return;
          setLiveStream(s);
          setLastFrameTime(
            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          );
        },
        onError: (err) => {
          if (!isMounted) return;
          setStreamError(err);
        },
      });

      if (isMounted && stream) {
        setLiveStream(stream);
        setLastFrameTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }
    };

    initCapture();

    return () => {
      isMounted = false;
      screenCaptureService.stop();
    };
  }, []);

  // Bind live MediaStream to video element once stream is available (no hitching on hover)
  useEffect(() => {
    if (videoRef.current && liveStream && videoRef.current.srcObject !== liveStream) {
      videoRef.current.srcObject = liveStream;
      videoRef.current.play().catch(() => {});
    }
  }, [liveStream]);

  // 2. Continuous Active Window Detection with deduplicated state updates
  const handleActiveWindowData = useCallback((data: ActiveWindowData) => {
    if (!data || !data.appName) return;
    setActiveWindow((prev) => {
      const cleanTitle = data.windowTitle || '';
      if (prev.appName === data.appName && prev.windowTitle === cleanTitle) {
        return prev; // Deduplicate: avoid re-renders when active app hasn't changed
      }
      setLastFrameTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      return {
        appName: data.appName,
        windowTitle: cleanTitle,
      };
    });
  }, []);

  const fetchActiveWindow = useCallback(async () => {
    if (window.electronAPI?.getActiveWindow) {
      try {
        const info = await window.electronAPI.getActiveWindow();
        if (info && info.appName) {
          handleActiveWindowData({
            appName: info.appName,
            windowTitle: info.windowTitle || '',
          });
        }
      } catch {}
    } else {
      handleActiveWindowData({
        appName: 'Browser Session',
        windowTitle: document.title || 'Desktop Environment',
      });
    }
  }, [handleActiveWindowData]);

  useEffect(() => {
    // Initial fetch
    fetchActiveWindow();

    // IPC event listener for real-time active window updates streamed from watcher process
    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.onActiveWindowUpdated) {
      unsubscribe = window.electronAPI.onActiveWindowUpdated((data) => {
        handleActiveWindowData(data);
      });
    }

    // Steady interval polling backup every 1.2s for continuous freshness
    const interval = setInterval(fetchActiveWindow, 1200);

    return () => {
      clearInterval(interval);
      if (unsubscribe) unsubscribe();
    };
  }, [fetchActiveWindow, handleActiveWindowData]);

  // 3. Mouse Event Click-Through Handling
  const handleTaskbarMouseEnter = () => {
    setIsTaskbarHovered(true);
    if (window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  };

  const handleTaskbarMouseLeave = () => {
    setIsTaskbarHovered(false);
    setShowSettingsPopover(false);
    if (window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  // Ensure click-through is enabled initially for transparent desktop visibility
  useEffect(() => {
    if (window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
    return () => {
      if (window.electronAPI?.setIgnoreMouseEvents) {
        window.electronAPI.setIgnoreMouseEvents(false);
      }
    };
  }, []);

  // 4. Manual refresh trigger
  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await fetchActiveWindow();
    setLastFrameTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    setTimeout(() => setIsRefreshing(false), 450);
  };

  return (
    <div
      className="screen-awareness-overlay"
      role="region"
      aria-label="October Desktop Screen Awareness"
    >
      {/* A. Initial Neural Cluster Expansion Transition (Unmounts after 850ms) */}
      {isTransitioning && (
        <ClusterExpansionTransition
          theme={theme}
          onComplete={() => setIsTransitioning(false)}
        />
      )}

      {/* B. Four Subtle Corner Indicators */}
      <ScreenCornerIndicators theme={theme} isExpanded={isTaskbarHovered} />

      {/* C. Slim Left-Edge Vertical Taskbar */}
      <aside
        className={`screen-slim-taskbar ${isTaskbarHovered ? 'taskbar-expanded' : ''}`}
        onMouseEnter={handleTaskbarMouseEnter}
        onMouseLeave={handleTaskbarMouseLeave}
        aria-label="Screen Awareness Taskbar"
      >
        {/* COLLAPSED TASKBAR ICON COLUMN */}
        <div className="taskbar-icon-column" aria-hidden="true">
          <div className="taskbar-icon-wrapper active-indicator" title="Screen Awareness: Active">
            <ScreenIcon size={16} />
            <span className="taskbar-live-dot" />
          </div>

          <div className="taskbar-icon-wrapper" title={`Active Application: ${activeWindow.appName}`}>
            <AppWindowIcon size={16} />
          </div>

          <div className="taskbar-icon-wrapper" title="Vision Scan Active">
            <ScanEyeIcon size={16} />
          </div>

          <div
            className="taskbar-icon-wrapper clickable-icon"
            onClick={handleManualRefresh}
            title="Refresh Desktop Context"
          >
            {isRefreshing ? <LoadingSpinnerIcon size={14} /> : <RefreshIcon size={14} />}
          </div>

          <div
            className="taskbar-icon-wrapper clickable-icon"
            onClick={() => setShowSettingsPopover((p) => !p)}
            title="Screen Awareness Information"
          >
            <SettingsIcon size={15} />
          </div>

          <div
            className="taskbar-icon-wrapper clickable-icon exit-icon"
            onClick={onExit}
            title="Exit Screen Mode (Esc)"
          >
            <ExitIcon size={15} />
          </div>
        </div>

        {/* EXPANDED HOVER FLYOUT DETAILS */}
        <div className="taskbar-flyout-content">
          {/* Section 1: Screen Mode Telemetry */}
          <div className="taskbar-section">
            <div className="taskbar-section-title">
              <span>SCREEN MODE</span>
              <span className="live-badge">
                <span className="live-dot" /> Live
              </span>
            </div>
            <div className="taskbar-card">
              <div className="telemetry-line">
                <span className="label">Status:</span>
                <span className="val highlight">Active Continuous</span>
              </div>
              <div className="telemetry-line">
                <span className="label">Display:</span>
                <span className="val">Primary ({screenResolution})</span>
              </div>
              <div className="telemetry-line">
                <span className="label">Updated:</span>
                <span className="val">{lastFrameTime || 'Monitoring'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Active External Application */}
          <div className="taskbar-section">
            <div className="taskbar-section-title">
              <span>ACTIVE APPLICATION</span>
            </div>
            <div className="taskbar-card active-app-card">
              <div className="active-app-row">
                <AppWindowIcon size={14} className="app-card-icon" />
                <span className="app-title-primary" title={activeWindow.appName}>
                  {activeWindow.appName}
                </span>
              </div>
              {activeWindow.windowTitle && (
                <div className="app-window-title" title={activeWindow.windowTitle}>
                  {activeWindow.windowTitle}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Real-Time Screen Preview */}
          <div className="taskbar-section">
            <div className="taskbar-section-title">
              <span>SCREEN PREVIEW</span>
              <button
                type="button"
                className="btn-taskbar-refresh"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Refresh preview"
              >
                {isRefreshing ? <LoadingSpinnerIcon size={11} /> : 'Refresh'}
              </button>
            </div>
            <div className="taskbar-preview-viewport">
              {liveStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="preview-video-stream"
                />
              ) : streamError ? (
                <div className="preview-error-box">
                  <span>{streamError}</span>
                </div>
              ) : (
                <div className="preview-fallback-box">
                  <LoadingSpinnerIcon size={16} />
                  <span>Connecting optical stream...</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Settings Popover or Controls */}
          {showSettingsPopover && (
            <div className="taskbar-section settings-popover-card">
              <div className="taskbar-section-title">
                <span>CONFIGURATION</span>
              </div>
              <p className="settings-desc">
                Screen capture is processed locally in real time. Visual OCR and AI model parsing
                will connect in the next milestone.
              </p>
            </div>
          )}

          {/* Section 5: Primary Action Controls */}
          <div className="taskbar-controls-row">
            <button
              type="button"
              className="taskbar-btn btn-action-refresh"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? <LoadingSpinnerIcon size={12} /> : 'Sync Context'}
            </button>
            <button
              type="button"
              className="taskbar-btn btn-action-exit"
              onClick={onExit}
              title="Return to October Chat (Esc)"
            >
              Exit Mode
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
