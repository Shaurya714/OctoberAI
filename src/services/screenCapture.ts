/**
 * Real-time continuous Screen Capture Service.
 * Uses hardware-accelerated MediaStream from desktopCapturer in Electron.
 * Provides live video preview, periodic snapshot extraction, and clean resource disposal.
 */

export interface ScreenStreamCallbacks {
  onStreamReady?: (stream: MediaStream) => void;
  onError?: (error: string) => void;
}

export class ScreenCaptureService {
  private mediaStream: MediaStream | null = null;
  private isCapturing = false;
  private offscreenVideo: HTMLVideoElement | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;

  public getIsCapturing(): boolean {
    return this.isCapturing;
  }

  public getStream(): MediaStream | null {
    return this.mediaStream;
  }

  /**
   * Starts real-time screen capture stream from primary desktop display.
   */
  public async start(callbacks?: ScreenStreamCallbacks): Promise<MediaStream | null> {
    this.stop();

    try {
      if (window.electronAPI?.getDesktopSources) {
        const sources = await window.electronAPI.getDesktopSources();
        const primarySource = sources[0];

        if (!primarySource) {
          throw new Error('No desktop screen source available for capture.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: primarySource.id,
              maxWidth: 1280,
              maxHeight: 720,
              maxFrameRate: 15,
            },
          } as any,
        });

        this.mediaStream = stream;
        this.isCapturing = true;

        if (callbacks?.onStreamReady) {
          callbacks.onStreamReady(stream);
        }

        return stream;
      } else {
        // In web browser dev environment, try getDisplayMedia or mock
        if (navigator.mediaDevices?.getDisplayMedia) {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          this.mediaStream = stream;
          this.isCapturing = true;
          if (callbacks?.onStreamReady) callbacks.onStreamReady(stream);
          return stream;
        }
        throw new Error('Screen capture is only supported in desktop mode.');
      }
    } catch (err: any) {
      this.stop();
      const msg = err?.message || 'Failed to initialize desktop screen stream.';
      if (callbacks?.onError) {
        callbacks.onError(msg);
      }
      return null;
    }
  }

  /**
   * Captures a single lightweight thumbnail frame (base64) from the active stream.
   */
  public captureFrame(maxWidth = 480, maxHeight = 270): string | null {
    if (!this.mediaStream || !this.isCapturing) return null;

    try {
      if (!this.offscreenVideo) {
        this.offscreenVideo = document.createElement('video');
        this.offscreenVideo.muted = true;
        this.offscreenVideo.playsInline = true;
        this.offscreenVideo.srcObject = this.mediaStream;
        this.offscreenVideo.play().catch(() => {});
      }

      const video = this.offscreenVideo;
      if (video.videoWidth === 0 || video.videoHeight === 0) return null;

      if (!this.offscreenCanvas) {
        this.offscreenCanvas = document.createElement('canvas');
      }

      const canvas = this.offscreenCanvas;
      const aspect = video.videoWidth / video.videoHeight;
      let targetW = maxWidth;
      let targetH = Math.round(maxWidth / aspect);

      if (targetH > maxHeight) {
        targetH = maxHeight;
        targetW = Math.round(maxHeight * aspect);
      }

      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, targetW, targetH);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }

  /**
   * Stops the stream, stops all media tracks, and cleans up video/canvas elements.
   */
  public stop(): void {
    this.isCapturing = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.mediaStream = null;
    }

    if (this.offscreenVideo) {
      try {
        this.offscreenVideo.pause();
        this.offscreenVideo.srcObject = null;
      } catch {}
      this.offscreenVideo = null;
    }

    this.offscreenCanvas = null;
  }
}

export const screenCaptureService = new ScreenCaptureService();
