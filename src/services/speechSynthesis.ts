/**
 * Frontend Text-to-Speech Service using browser/Electron SpeechSynthesis API.
 * Uses native English voice to speak AI responses aloud without third-party credentials.
 */

export interface TTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

export class TextToSpeechService {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
      this.synth.addEventListener('voiceschanged', () => this.initVoices());
    }
  }

  private initVoices(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices || voices.length === 0) return;

    // Filter to English voices
    const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    const candidateVoices = enVoices.length > 0 ? enVoices : voices;

    // Intelligent voice ranking: prioritize soft, natural female English voices
    const scoreVoice = (v: SpeechSynthesisVoice): number => {
      const name = v.name.toLowerCase();
      let score = 0;

      // Penalize male voices heavily
      const maleNames = ['david', 'mark', 'george', 'richard', 'james', 'male', 'guy', 'stefan', 'paul', 'adam'];
      if (maleNames.some((m) => name.includes(m))) {
        score -= 1000;
      }

      // Prioritize natural / neural voices
      if (name.includes('natural') || name.includes('neural') || name.includes('online')) {
        score += 80;
      }

      // High priority for soft natural female voices (Windows Zira, Edge Natural Jenny/Aria/Sonia, macOS Samantha)
      const preferredFemaleNames = [
        'jenny', 'aria', 'sonia', 'zira', 'samantha', 'karen', 'victoria', 'eva', 'clara', 'sarah', 'emma', 'amy', 'female'
      ];
      for (const f of preferredFemaleNames) {
        if (name.includes(f)) {
          score += 100;
          break;
        }
      }

      // Neutral conversational English
      if (v.lang === 'en-US' || v.lang === 'en_US') {
        score += 15;
      } else if (v.lang.startsWith('en')) {
        score += 5;
      }

      return score;
    };

    const sorted = [...candidateVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
    this.selectedVoice = sorted[0] || null;
  }

  /**
   * Sanitizes markdown text into natural, spoken English prose.
   * Strips code blocks, URLs, markdown symbols, and technical formatting.
   */
  public cleanTextForSpeech(rawText: string): string {
    return rawText
      // Remove code blocks entirely or replace with notice
      .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove Markdown links, keep link text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove Markdown headers
      .replace(/#{1,6}\s+/g, '')
      // Remove bold and italics
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove blockquotes and list bullets
      .replace(/^>\s+/gm, '')
      .replace(/^[\*\-+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Speaks the text aloud using the best available English voice.
   */
  public speak(text: string, options?: TTSOptions): void {
    if (!this.synth) {
      if (options?.onError) options.onError('SpeechSynthesis not supported');
      return;
    }

    // Cancel any ongoing speech to avoid overlap
    this.stop();

    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) {
      if (options?.onEnd) options.onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = 1.0; // Soft conversational pace
    utterance.pitch = 1.02; // Warm, natural vocal inflection

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (options?.onStart) options.onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (options?.onEnd) options.onEnd();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (options?.onError) options.onError(e);
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  /**
   * Stops any currently playing speech immediately.
   */
  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public getCurrentUtterance(): SpeechSynthesisUtterance | null {
    return this.currentUtterance;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
}

export const ttsService = new TextToSpeechService();
