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

/**
 * Encodes 32-bit float PCM audio samples into standard 16kHz 16-bit mono WAV as Base64.
 */
function encodeWavBase64(samples: Float32Array, sampleRate: number): string {
  const targetSampleRate = 16000;
  let resampled: Float32Array;

  if (sampleRate === targetSampleRate) {
    resampled = samples;
  } else {
    // Anti-aliasing decimation (box-car moving average across resampling ratio)
    const ratio = sampleRate / targetSampleRate;
    const newLen = Math.round(samples.length / ratio);
    resampled = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(Math.floor((i + 1) * ratio), samples.length);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j];
        count++;
      }
      resampled[i] = count > 0 ? sum / count : samples[start];
    }
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = targetSampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataByteCount = resampled.length * 2;
  const buffer = new ArrayBuffer(44 + dataByteCount);
  const view = new DataView(buffer);

  // 'RIFF' chunk descriptor
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataByteCount, true);
  view.setUint32(8, 0x57415645, false); // 'WAVE'

  // 'fmt ' sub-chunk
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true); // 16 for PCM
  view.setUint16(20, 1, true); // PCM = 1
  view.setUint16(22, numChannels, true); // Mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // 'data' sub-chunk
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataByteCount, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
  }
  return btoa(binary);
}

export class AudioCaptureService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private recordingNode: ScriptProcessorNode | null = null;
  private recordedChunks: Float32Array[] = [];
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
      let ctx: AudioContext;
      try {
        ctx = new AudioContextClass({ sampleRate: 16000 });
      } catch {
        ctx = new AudioContextClass();
      }
      this.audioContext = ctx;

      const sourceNode = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.55;

      sourceNode.connect(analyser);
      this.analyser = analyser;
      this.dataArray = new Uint8Array(analyser.frequencyBinCount);
      this.isCapturing = true;
      this.recordedChunks = [];

      // Audio buffer recorder for genuine offline speech recognition
      try {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (!this.isCapturing) return;
          const channelData = e.inputBuffer.getChannelData(0);
          // Retain up to ~30 seconds of rolling audio (~300 buffers of 4096 samples at 44.1/48kHz)
          if (this.recordedChunks.length > 300) {
            this.recordedChunks.shift();
          }
          this.recordedChunks.push(new Float32Array(channelData));
        };
        sourceNode.connect(processor);
        // Connect via zero-gain node so audioprocess fires continuously in Chromium without echoing mic to speakers
        const muteGain = ctx.createGain();
        muteGain.gain.value = 0;
        processor.connect(muteGain);
        muteGain.connect(ctx.destination);
        this.recordingNode = processor;
      } catch (procErr) {
        console.warn('Audio recorder node setup failed:', procErr);
      }

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
   * Returns standard 16kHz 16-bit mono WAV as Base64 for transcription.
   */
  public getRecordedWavBase64(): string | null {
    if (this.recordedChunks.length === 0 || !this.audioContext) return null;

    let totalSamples = 0;
    for (let i = 0; i < this.recordedChunks.length; i++) {
      totalSamples += this.recordedChunks[i].length;
    }
    // Need at least ~0.25 seconds of audio to attempt transcription
    if (totalSamples < 10000) return null;

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (let i = 0; i < this.recordedChunks.length; i++) {
      merged.set(this.recordedChunks[i], offset);
      offset += this.recordedChunks[i].length;
    }

    return encodeWavBase64(merged, this.audioContext.sampleRate);
  }

  public clearRecordedAudio(): void {
    this.recordedChunks = [];
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

    if (this.recordingNode) {
      try {
        this.recordingNode.disconnect();
      } catch {}
      this.recordingNode = null;
    }
    this.recordedChunks = [];

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
