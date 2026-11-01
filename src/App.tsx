import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FloatingPill } from './components/FloatingPill';
import { ExpandedPanel } from './components/ExpandedPanel';
import { ScreenAwareness } from './components/ScreenAwareness';
import { Message, InputModality } from './types';
import { BackendChatMessage, streamChatMessage } from './services/api';
import { NeuralState } from './components/NeuralCore';
import { NeuralTheme, getSavedTheme, saveTheme } from './theme';
import { audioCaptureService, AudioInputSource } from './services/audioCapture';
import { speechRecognitionService } from './services/speechRecognition';
import { ttsService } from './services/speechSynthesis';
import './App.css';

const INITIAL_WELCOME_MESSAGE: Message = {
  id: 'msg-welcome-init',
  sender: 'assistant',
  text: "Hey! What's on your mind?",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

export const App: React.FC = () => {
  const [theme, setTheme] = useState<NeuralTheme>(getSavedTheme);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isScreenMode, setIsScreenMode] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Voice Interaction Mode State
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [interimVoiceTranscript, setInterimVoiceTranscript] = useState('');
  const [voiceInputSource, setVoiceInputSource] = useState<AudioInputSource>('microphone');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakResponsesEnabled, setSpeakResponsesEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('october_speak_responses_enabled') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSpeakResponses = useCallback(() => {
    setSpeakResponsesEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('october_speak_responses_enabled', String(next));
      } catch {}
      return next;
    });
  }, []);

  const isSubmittingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedAssistantTextRef = useRef<string>('');
  const transcriptionTimerRef = useRef<any>(null);
  const isTranscribingRef = useRef<boolean>(false);

  // Sync theme with document element and persistence
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleSelectTheme = (newTheme: NeuralTheme) => {
    setTheme(newTheme);
    saveTheme(newTheme);
  };

  // Sync window size with Electron whenever expansion state changes
  const updateElectronWindow = useCallback((mode: 'collapsed' | 'chat' | 'screen') => {
    if (window.electronAPI?.setAppMode) {
      window.electronAPI.setAppMode(mode).catch(console.error);
    } else if (window.electronAPI?.setExpanded) {
      window.electronAPI.setExpanded(mode !== 'collapsed').catch(console.error);
    }
  }, []);

  // Explicit user click or trigger to expand
  const handleExpand = (_pinned: boolean = true) => {
    setIsExpanded(true);
    updateElectronWindow(isScreenMode ? 'screen' : 'chat');
  };

  const performTranscription = useCallback(async () => {
    if (isTranscribingRef.current) return;
    if (!window.electronAPI?.transcribeAudio) return;

    const wavBase64 = audioCaptureService.getRecordedWavBase64();
    if (!wavBase64) return;

    try {
      isTranscribingRef.current = true;
      const res = await window.electronAPI.transcribeAudio(wavBase64);
      if (res && res.success && res.text) {
        const text = res.text.trim();
        if (text) {
          setVoiceTranscript(text);
          setInterimVoiceTranscript('');
          setVoiceError(null);
        }
      }
    } catch (err: any) {
      console.warn('Transcription error:', err);
    } finally {
      isTranscribingRef.current = false;
    }
  }, []);

  const stopVoiceMode = useCallback(async (transcribeRemaining: boolean = false): Promise<string> => {
    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current);
      transcriptionTimerRef.current = null;
    }

    let remainingWav: string | null = null;
    if (transcribeRemaining && audioCaptureService.getIsCapturing()) {
      remainingWav = audioCaptureService.getRecordedWavBase64();
    }

    setIsVoiceListening(false);
    audioCaptureService.stop();
    speechRecognitionService.stop();
    setAudioLevel(0);

    let finalRecognized = '';
    if (remainingWav && window.electronAPI?.transcribeAudio && !isTranscribingRef.current) {
      try {
        isTranscribingRef.current = true;
        setInterimVoiceTranscript('Transcribing speech...');
        const res = await window.electronAPI.transcribeAudio(remainingWav);
        if (res && res.success && res.text) {
          finalRecognized = res.text.trim();
          if (finalRecognized) {
            setVoiceTranscript(finalRecognized);
            setInterimVoiceTranscript('');
            setVoiceError(null);
          } else {
            setInterimVoiceTranscript('');
          }
        } else {
          setInterimVoiceTranscript('');
        }
      } catch {
        setInterimVoiceTranscript('');
      } finally {
        isTranscribingRef.current = false;
      }
    }
    return finalRecognized;
  }, []);

  // Explicit minimize / collapse: only via collapse control or Escape key
  const handleCollapse = useCallback(() => {
    // Stop any active voice capture and speech playback
    stopVoiceMode();
    ttsService.stop();
    setIsSpeaking(false);
    setIsScreenMode(false);
    setIsExpanded(false);
    updateElectronWindow('collapsed');
  }, [stopVoiceMode, updateElectronWindow]);

  // Hover states only affect neural activity, never trigger expansion
  const handleHoverStart = () => {
    setIsHovered(true);
  };

  const handleHoverEnd = () => {
    setIsHovered(false);
  };

  const handleTogglePin = () => {
    setIsPinned((prev) => !prev);
  };

  const handleInputFocusChange = (_focused: boolean) => {};

  const handleInputChange = (_text: string) => {};

  const handleClose = () => {
    stopVoiceMode();
    ttsService.stop();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (window.electronAPI?.closeApp) {
      window.electronAPI.closeApp();
    } else {
      handleCollapse();
    }
  };

  // Voice Interaction Mode Handlers
  const startVoiceMode = async (source: AudioInputSource) => {
    // Stop any active TTS playback
    ttsService.stop();
    setIsSpeaking(false);
    setVoiceError(null);
    setVoiceTranscript('');
    setInterimVoiceTranscript('');
    setIsVoiceListening(true);

    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current);
      transcriptionTimerRef.current = null;
    }

    // 1. Audio Level Analyzer for Audio-Reactive NeuralCore
    const audioStarted = await audioCaptureService.start(source, {
      onLevel: (level) => setAudioLevel(level),
      onError: (err) => {
        setVoiceError(err);
        setIsVoiceListening(false);
      },
    });

    if (!audioStarted) {
      setIsVoiceListening(false);
      return;
    }

    // 2. English Speech Recognition
    if (window.electronAPI?.transcribeAudio) {
      // Offline Windows System.Speech Engine (processes both mic & system loopback)
      transcriptionTimerRef.current = setInterval(() => {
        performTranscription();
      }, 2500);
    } else if (source === 'microphone') {
      // Browser fallback (Web Speech API)
      const recognitionStarted = speechRecognitionService.start({
        onStart: () => {},
        onInterimResult: (interim) => {
          setInterimVoiceTranscript(interim);
        },
        onFinalResult: (final) => {
          setVoiceTranscript(final);
          setInterimVoiceTranscript('');
        },
        onError: (err, isFatal) => {
          setVoiceError(err);
          if (isFatal) {
            setIsVoiceListening(false);
            audioCaptureService.stop();
          }
        },
        onEnd: () => {},
      });

      if (!recognitionStarted) {
        setVoiceError(
          'Live speech recognition is not supported in this runtime. Audio level reactivity is active.'
        );
      }
    } else {
      setVoiceError('System audio transcription requires the desktop Electron runtime.');
    }
  };

  const handleToggleVoice = async () => {
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }

    if (isVoiceListening) {
      // Deactivating: collect completed transcript and submit through pipeline exactly once
      const finalResult = await stopVoiceMode(true);
      const textToSubmit = (finalResult || voiceTranscript).trim();

      // Clear transcript buffer
      setVoiceTranscript('');
      setInterimVoiceTranscript('');
      audioCaptureService.clearRecordedAudio();

      if (textToSubmit) {
        handleSendMessage(textToSubmit, 'microphone');
      }
    } else {
      // Exit screen mode if currently active (mutual exclusivity)
      if (isScreenMode) {
        setIsScreenMode(false);
        updateElectronWindow('chat');
      }
      if (!isExpanded) {
        setIsExpanded(true);
        updateElectronWindow('chat');
      }
      setVoiceTranscript('');
      setInterimVoiceTranscript('');
      startVoiceMode(voiceInputSource);
    }
  };

  const handleChangeVoiceSource = (source: AudioInputSource) => {
    setVoiceInputSource(source);
    if (isVoiceListening) {
      startVoiceMode(source);
    }
  };

  const handleConfirmVoiceTranscript = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    stopVoiceMode(false);
    audioCaptureService.clearRecordedAudio();
    setVoiceTranscript('');
    setInterimVoiceTranscript('');
    handleSendMessage(trimmed, 'microphone');
  };

  // Screen Awareness Handlers
  const handleToggleScreenAwareness = () => {
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }
    if (isVoiceListening) {
      stopVoiceMode();
    }

    if (!isScreenMode) {
      setIsScreenMode(true);
      updateElectronWindow('screen');
    } else {
      handleExitScreenMode();
    }
  };

  const handleExitScreenMode = () => {
    setIsScreenMode(false);
    setIsExpanded(true);
    updateElectronWindow('chat');
  };

  // Clean up audio & speech on unmount
  useEffect(() => {
    return () => {
      if (transcriptionTimerRef.current) {
        clearInterval(transcriptionTimerRef.current);
      }
      audioCaptureService.stop();
      speechRecognitionService.stop();
      ttsService.stop();
    };
  }, []);

  const handleSendMessage = async (text: string, modality: InputModality = 'text') => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || isStreaming || isSubmittingRef.current) return;

    // Interrupt any ongoing speech
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }

    // Section C: Immutable response speech policy captured at submission time
    const shouldSpeakResponse =
      modality === 'microphone' ||
      (modality === 'text' && speakResponsesEnabled) ||
      (modality === 'system_audio' && speakResponsesEnabled);

    isSubmittingRef.current = true;
    setIsLoading(true);
    setIsStreaming(false);
    setHasError(false);
    accumulatedAssistantTextRef.current = '';

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `msg-${Date.now()}-user`;
    const assistantMsgId = `msg-${Date.now()}-assistant`;

    const userMessage: Message = {
      id: userMsgId,
      sender: 'user',
      text: trimmed,
      timestamp: timeStr,
    };

    const conversationHistory: BackendChatMessage[] = [
      ...messages
        .filter((m) => (m.sender === 'user' || m.sender === 'assistant') && !m.isError && m.id !== 'msg-welcome-init')
        .slice(-14)
        .map((m) => ({
          role: m.sender as 'user' | 'assistant',
          content: m.text,
        })),
      { role: 'user', content: trimmed },
    ];

    setMessages((prev) => [...prev, userMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let hasReceivedFirstChunk = false;

    try {
      await streamChatMessage(
        conversationHistory,
        {
          onChunk: (chunk: string) => {
            accumulatedAssistantTextRef.current += chunk;
            if (!hasReceivedFirstChunk) {
              hasReceivedFirstChunk = true;
              setIsLoading(false);
              setIsStreaming(true);
              const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const assistantMessage: Message = {
                id: assistantMsgId,
                sender: 'assistant',
                text: chunk,
                timestamp: nowTime,
              };
              setMessages((prev) => [...prev, assistantMessage]);
            } else {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, text: msg.text + chunk }
                    : msg
                )
              );
            }
          },
          onComplete: () => {
            setIsLoading(false);
            setIsStreaming(false);
            isSubmittingRef.current = false;

            // Section C: Speak completed AI response according to immutable submission policy
            if (shouldSpeakResponse) {
              const fullResponse = accumulatedAssistantTextRef.current;
              if (fullResponse) {
                ttsService.speak(fullResponse, {
                  onStart: () => setIsSpeaking(true),
                  onEnd: () => setIsSpeaking(false),
                  onError: () => setIsSpeaking(false),
                });
              }
            }
          },
          onError: (errorDetail: string) => {
            setIsLoading(false);
            setIsStreaming(false);
            isSubmittingRef.current = false;
            setHasError(true);
            setTimeout(() => setHasError(false), 2400);

            const errTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const errorMessage: Message = {
              id: `msg-${Date.now()}-err`,
              sender: 'system',
              text: errorDetail,
              timestamp: errTime,
              isError: true,
            };
            setMessages((prev) => [...prev, errorMessage]);
          },
        },
        controller.signal,
      );
    } catch (err: any) {
      setIsLoading(false);
      setIsStreaming(false);
      isSubmittingRef.current = false;
      setHasError(true);
      setTimeout(() => setHasError(false), 2400);

      const errorText =
        err?.message || 'An unexpected error occurred while communicating with the AI service.';
      const errorMessage: Message = {
        id: `msg-${Date.now()}-err`,
        sender: 'system',
        text: errorText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // Keyboard accessibility: Escape exits Screen Mode or collapses Expanded Panel
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isScreenMode) {
          handleExitScreenMode();
        } else if (isVoiceListening) {
          stopVoiceMode();
        } else if (isSpeaking) {
          ttsService.stop();
          setIsSpeaking(false);
        } else if (isExpanded && !isLoading && !isStreaming) {
          handleCollapse();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isScreenMode, isVoiceListening, isSpeaking, isExpanded, isLoading, isStreaming, handleCollapse, stopVoiceMode]);

  // Listen to IPC force-collapse from main process
  useEffect(() => {
    if (window.electronAPI?.onForceCollapse) {
      const unsubscribe = window.electronAPI.onForceCollapse(() => {
        handleCollapse();
      });
      return unsubscribe;
    }
  }, [handleCollapse]);

  const currentNeuralState: NeuralState = hasError
    ? 'error'
    : isSpeaking
    ? 'speaking'
    : isVoiceListening
    ? interimVoiceTranscript || voiceTranscript
      ? 'transcribing'
      : 'listening'
    : isLoading
    ? 'processing'
    : isStreaming
    ? 'responding'
    : isExpanded || isScreenMode
    ? 'expanded'
    : isHovered
    ? 'hover'
    : 'idle';

  return (
    <main className="app-container">
      {!isExpanded ? (
        <FloatingPill
          onExpand={handleExpand}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
          state={currentNeuralState}
          theme={theme}
        />
      ) : isScreenMode ? (
        <ScreenAwareness
          theme={theme}
          onExit={handleExitScreenMode}
          onClose={handleClose}
        />
      ) : (
        <ExpandedPanel
          messages={messages}
          isPinned={isPinned}
          isLoading={isLoading || isStreaming}
          neuralState={currentNeuralState}
          theme={theme}
          audioLevel={audioLevel}
          isVoiceListening={isVoiceListening}
          voiceTranscript={voiceTranscript}
          interimVoiceTranscript={interimVoiceTranscript}
          voiceInputSource={voiceInputSource}
          voiceError={voiceError}
          isSpeaking={isSpeaking}
          speakResponsesEnabled={speakResponsesEnabled}
          onToggleSpeakResponses={handleToggleSpeakResponses}
          onStopSpeaking={() => {
            ttsService.stop();
            setIsSpeaking(false);
          }}
          onSelectTheme={handleSelectTheme}
          onTogglePin={handleTogglePin}
          onCollapse={handleCollapse}
          onClose={handleClose}
          onSendMessage={handleSendMessage}
          onInputFocusChange={handleInputFocusChange}
          onInputChange={handleInputChange}
          onMouseEnter={handleHoverStart}
          onMouseLeave={handleHoverEnd}
          onToggleVoice={handleToggleVoice}
          onChangeVoiceSource={handleChangeVoiceSource}
          onToggleScreenAwareness={handleToggleScreenAwareness}
          onConfirmVoiceTranscript={handleConfirmVoiceTranscript}
        />
      )}
    </main>
  );
};
