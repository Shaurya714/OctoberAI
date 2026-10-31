/**
 * Real-time Audio Capture & Level Analyzer using Web Audio API.
 * Computes live smoothed audio volume (0.0 to 1.0) for the audio-reactive NeuralCore.
 * Supports both Physical Microphone input and Desktop System Audio capture.
 */

export type AudioInputSource = 'microphone' | 'system';

export interface AudioCaptureCallbacks {
  onLevel?: (level: number) => void;
  onError?: (error: string) => void;
  onSourceChanged?: (source: AudioInputSource) => void;
}

export class AudioCaptureService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private dataArray: Uint8Array | null = null;
  private animFrameId: number | null = null;
  private smoothedLevel = 0;
  private activeSource: AudioInputSource = 'microphone';
  private isCapturing = false;

  public getActiveSource(): AudioInputSource {
    return this.activeSource;
  }

  public getIsCapturing(): boolean {
    return this.isCapturing;
  }

  public getSmoothedLevel(): number {
    return this.smoothedLevel;
  }

  /**
   * Starts capturing audio from the chosen source (microphone or system loopback).
   */
  public async start(
    source: AudioInputSource = 'microphone',
    callbacks?: AudioCaptureCallbacks
  ): Promise<boolean> {
    this.stop();
    this.activeSource = source;

    try {
      let stream: MediaStream;

      if (source === 'system') {
        // Desktop system audio capture via Electron desktopCapturer
        if (window.electronAPI?.getDesktopSources) {
          const sources = await window.electronAPI.getDesktopSources();
          const primarySource = sources[0];

          if (!primarySource) {
            throw new Error('No desktop audio source found.');
          }

          // In Chromium/Electron, desktop audio is captured with chromeMediaSource
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
              },
            } as any,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: primarySource.id,
              },
            } as any,
          });

          // Discard unused video tracks to conserve CPU/GPU
          stream.getVideoTracks().forEach((track) => track.stop());
        } else {
          throw new Error('System audio capture is only available in the Electron desktop app.');
        }
      } else {
        // Standard physical microphone
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }

      this.mediaStream = stream;

      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      this.audioContext = ctx;

      const sourceNode = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.55;

      sourceNode.connect(analyser);
      this.analyser = analyser;
      this.dataArray = new Uint8Array(analyser.frequencyBinCount);
      this.isCapturing = true;

      // Start real-time level analysis loop
      const updateLevel = () => {
        if (!this.isCapturing || !this.analyser || !this.dataArray) return;

        (this.analyser as any).getByteFrequencyData(this.dataArray);

        let sum = 0;
        const len = this.dataArray.length;
        for (let i = 0; i < len; i++) {
          sum += this.dataArray[i];
        }

        const rawAverage = sum / len / 255;
        // Non-linear amplification so subtle speech registers cleanly
        const scaledLevel = Math.min(1.0, Math.pow(rawAverage * 1.8, 1.2));

        // Smooth responsive interpolation
        this.smoothedLevel = this.smoothedLevel * 0.65 + scaledLevel * 0.35;

        if (callbacks?.onLevel) {
          callbacks.onLevel(this.smoothedLevel);
        }

        this.animFrameId = requestAnimationFrame(updateLevel);
      };

      this.animFrameId = requestAnimationFrame(updateLevel);
      if (callbacks?.onSourceChanged) {
        callbacks.onSourceChanged(source);
      }
      return true;
    } catch (err: any) {
      this.stop();
      let errorMsg = 'Failed to access audio device.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Audio permission was denied. Please allow microphone access in system settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No audio input devices were detected on this computer.';
      } else if (err.message) {
        errorMsg = err.message;
      }

      if (callbacks?.onError) {
        callbacks.onError(errorMsg);
      }
      return false;
    }
  }

  /**
   * Completely stops audio capture, releases microphone hardware tracks, and closes AudioContext.
   */
  public stop(): void {
    this.isCapturing = false;
    this.smoothedLevel = 0;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop error
        }
      });
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // Ignore close error
      }
      this.audioContext = null;
    }

    this.analyser = null;
    this.dataArray = null;
  }
}

export const audioCaptureService = new AudioCaptureService();
