import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FloatingPill } from './components/FloatingPill';
import { ExpandedPanel } from './components/ExpandedPanel';
import { ScreenAwareness } from './components/ScreenAwareness';
import { Message } from './types';
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

  const isSubmittingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedAssistantTextRef = useRef<string>('');

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

  const stopVoiceMode = useCallback(() => {
    setIsVoiceListening(false);
    audioCaptureService.stop();
    speechRecognitionService.stop();
    setAudioLevel(0);
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

    // 1. Audio Level Analyzer for Audio-Reactive NeuralCore
    const audioStarted = await audioCaptureService.start(source, {
      onError: (err) => setVoiceError(err),
    });

    if (!audioStarted) {
      setIsVoiceListening(false);
      return;
    }

    // 2. English Speech Recognition
    if (source === 'microphone') {
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
      // System audio capture active: visualizer active, document honest limitation
      setVoiceTranscript('');
      setInterimVoiceTranscript('Capturing computer audio playback... (Audio-reactive visualization active)');
    }
  };

  const handleToggleVoice = () => {
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }

    if (isVoiceListening) {
      stopVoiceMode();
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
    stopVoiceMode();
    setVoiceTranscript('');
    setInterimVoiceTranscript('');
    handleSendMessage(trimmed);
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
      audioCaptureService.stop();
      speechRecognitionService.stop();
      ttsService.stop();
    };
  }, []);

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || isStreaming || isSubmittingRef.current) return;

    // Interrupt any ongoing speech
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }

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

            // Section 3.5: Speak completed AI response using frontend text-to-speech
            const fullResponse = accumulatedAssistantTextRef.current;
            if (fullResponse) {
              ttsService.speak(fullResponse, {
                onStart: () => setIsSpeaking(true),
                onEnd: () => setIsSpeaking(false),
                onError: () => setIsSpeaking(false),
              });
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
