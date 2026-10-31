import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FloatingPill } from './components/FloatingPill';
import { ExpandedPanel } from './components/ExpandedPanel';
import { Message } from './types';
import { BackendChatMessage, streamChatMessage } from './services/api';
import { NeuralState } from './components/NeuralCore';
import { NeuralTheme, getSavedTheme, saveTheme } from './theme';
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
  const [isPinned, setIsPinned] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isSubmittingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync theme with document element and persistence
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleSelectTheme = (newTheme: NeuralTheme) => {
    setTheme(newTheme);
    saveTheme(newTheme);
  };

  // Sync window size with Electron whenever expansion state changes
  const updateElectronWindow = useCallback((expanded: boolean) => {
    if (window.electronAPI?.setExpanded) {
      window.electronAPI.setExpanded(expanded).catch(console.error);
    }
  }, []);

  // Explicit user click or trigger to expand
  const handleExpand = (_pinned: boolean = true) => {
    setIsExpanded(true);
    updateElectronWindow(true);
  };

  // Explicit minimize / collapse: only via collapse control or Escape key
  const handleCollapse = () => {
    setIsExpanded(false);
    updateElectronWindow(false);
  };

  // Hover states only affect neural activity, never trigger expansion
  const handleHoverStart = () => {
    setIsHovered(true);
  };

  // Hover end never collapses the expanded assistant
  const handleHoverEnd = () => {
    setIsHovered(false);
  };

  const handleTogglePin = () => {
    setIsPinned((prev) => !prev);
  };

  const handleInputFocusChange = (_focused: boolean) => {};

  const handleInputChange = (_text: string) => {};

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (window.electronAPI?.closeApp) {
      window.electronAPI.closeApp();
    } else {
      handleCollapse();
    }
  };

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    // Guard against duplicate submission or submitting while waiting
    if (!trimmed || isLoading || isStreaming || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsLoading(true);
    setIsStreaming(false);
    setHasError(false);

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `msg-${Date.now()}-user`;
    const assistantMsgId = `msg-${Date.now()}-assistant`;

    const userMessage: Message = {
      id: userMsgId,
      sender: 'user',
      text: trimmed,
      timestamp: timeStr,
    };

    // Construct bounded conversation history for backend, excluding static welcome message
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

    // Setup abort controller for current stream
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let hasReceivedFirstChunk = false;

    try {
      await streamChatMessage(
        conversationHistory,
        {
          onChunk: (chunk: string) => {
            if (!hasReceivedFirstChunk) {
              hasReceivedFirstChunk = true;
              setIsLoading(false); // Switch from 'Thinking...' to progressive streaming display
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

  // Keyboard accessibility: Escape collapses back to neural presence
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded && !isLoading && !isStreaming) {
        handleCollapse();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isExpanded, isLoading, isStreaming]);

  // Listen to IPC force-collapse from main process if sent
  useEffect(() => {
    if (window.electronAPI?.onForceCollapse) {
      const unsubscribe = window.electronAPI.onForceCollapse(() => {
        handleCollapse();
      });
      return unsubscribe;
    }
  }, []);

  const currentNeuralState: NeuralState = hasError
    ? 'error'
    : isLoading
    ? 'processing'
    : isStreaming
    ? 'responding'
    : isExpanded
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
      ) : (
        <ExpandedPanel
          messages={messages}
          isPinned={isPinned}
          isLoading={isLoading || isStreaming}
          neuralState={currentNeuralState}
          theme={theme}
          onSelectTheme={handleSelectTheme}
          onTogglePin={handleTogglePin}
          onCollapse={handleCollapse}
          onClose={handleClose}
          onSendMessage={handleSendMessage}
          onInputFocusChange={handleInputFocusChange}
          onInputChange={handleInputChange}
          onMouseEnter={handleHoverStart}
          onMouseLeave={handleHoverEnd}
        />
      )}
    </main>
  );
};
