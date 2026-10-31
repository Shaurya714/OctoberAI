/**
 * English Speech Recognition Service using browser/Electron SpeechRecognition API.
 * Captures live spoken audio and delivers progressive interim and finalized transcriptions.
 */

export interface SpeechRecognitionCallbacks {
  onInterimResult: (interimText: string) => void;
  onFinalResult: (finalText: string) => void;
  onError: (errorMessage: string, isFatal: boolean) => void;
  onEnd: () => void;
  onStart: () => void;
}

export class SpeechRecognitionService {
  private recognition: any = null;
  private isListening = false;
  private accumulatedFinalText = '';
  private currentCallbacks: SpeechRecognitionCallbacks | null = null;
  private shouldRestart = false;

  constructor() {
    this.initEngine();
  }

  private initEngine(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) return;

    try {
      this.recognition = new SpeechRecognitionConstructor();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        if (this.currentCallbacks?.onStart) {
          this.currentCallbacks.onStart();
        }
      };

      this.recognition.onresult = (event: any) => {
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            // Append with proper punctuation spacing
            const trimmed = transcript.trim();
            if (trimmed) {
              if (this.accumulatedFinalText && !this.accumulatedFinalText.endsWith(' ')) {
                this.accumulatedFinalText += ' ';
              }
              this.accumulatedFinalText += trimmed;
            }
          } else {
            interimText += transcript;
          }
        }

        if (this.currentCallbacks) {
          if (interimText) {
            this.currentCallbacks.onInterimResult(interimText.trim());
          }
          if (this.accumulatedFinalText) {
            this.currentCallbacks.onFinalResult(this.accumulatedFinalText.trim());
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        let userMessage = 'Speech recognition error occurred.';
        let isFatal = false;

        switch (event.error) {
          case 'network':
          case 'service-not-allowed':
            userMessage =
              'Cloud speech recognition service is not reachable in this Electron environment. You can also type directly in the chat.';
            isFatal = true;
            break;
          case 'not-allowed':
          case 'permission-denied':
            userMessage =
              'Microphone access was denied. Please check your OS/desktop microphone permissions.';
            isFatal = true;
            break;
          case 'no-speech':
            // Non-fatal silence timeout, keep listening
            return;
          case 'audio-capture':
            userMessage = 'No microphone device was detected or audio capture failed.';
            isFatal = true;
            break;
          case 'aborted':
            // Intentional stop, do not display error
            return;
          default:
            userMessage = `Speech recognition reported: ${event.error || 'unknown issue'}`;
            break;
        }

        if (this.currentCallbacks?.onError) {
          this.currentCallbacks.onError(userMessage, isFatal);
        }

        if (isFatal) {
          this.stop();
        }
      };

      this.recognition.onend = () => {
        if (this.shouldRestart && this.isListening) {
          try {
            this.recognition.start();
            return;
          } catch {
            // Ignore restart failure
          }
        }

        this.isListening = false;
        if (this.currentCallbacks?.onEnd) {
          this.currentCallbacks.onEnd();
        }
      };
    } catch (err) {
      console.warn('SpeechRecognition initialization error:', err);
      this.recognition = null;
    }
  }

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
  }

  public start(callbacks: SpeechRecognitionCallbacks): boolean {
    if (!this.recognition) {
      callbacks.onError(
        'Speech recognition is not supported in this runtime. Browser speech recognition requires an active webkitSpeechRecognition API.',
        true
      );
      return false;
    }

    if (this.isListening) {
      this.stop();
    }

    this.accumulatedFinalText = '';
    this.currentCallbacks = callbacks;
    this.shouldRestart = true;

    try {
      this.recognition.start();
      return true;
    } catch (err: any) {
      callbacks.onError(
        err?.message || 'Could not start speech recognition. Please check your microphone.',
        true
      );
      return false;
    }
  }

  public stop(): void {
    this.shouldRestart = false;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop error
      }
    }
    this.isListening = false;
  }

  public abort(): void {
    this.shouldRestart = false;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore abort error
      }
    }
    this.isListening = false;
    this.accumulatedFinalText = '';
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}

export const speechRecognitionService = new SpeechRecognitionService();
