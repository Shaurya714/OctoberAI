import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FloatingPill } from './components/FloatingPill';
import { ExpandedPanel } from './components/ExpandedPanel';
import { Message } from './types';
import { BackendChatMessage, streamChatMessage } from './services/api';
import './App.css';

const INITIAL_WELCOME_MESSAGE: Message = {
  id: 'msg-welcome-init',
  sender: 'assistant',
  text: "Hey! What's on your mind?",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

export const App: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([INITIAL_WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);

  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hoverExpandTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync window size with Electron whenever expansion state changes
  const updateElectronWindow = useCallback((expanded: boolean) => {
    if (window.electronAPI?.setExpanded) {
      window.electronAPI.setExpanded(expanded).catch(console.error);
    }
  }, []);

  const handleExpand = (pinned: boolean) => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setIsExpanded(true);
    if (pinned) {
      setIsPinned(true);
    }
    updateElectronWindow(true);
  };

  const handleCollapse = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setIsExpanded(false);
    setIsPinned(false);
    setIsInputFocused(false);
    updateElectronWindow(false);
  };

  const handleHoverStart = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    if (!isExpanded) {
      // Short delay on hover to avoid accidental trigger on cursor pass-by
      hoverExpandTimerRef.current = setTimeout(() => {
        handleExpand(false);
      }, 140);
    }
  };

  const handleHoverEnd = () => {
    if (hoverExpandTimerRef.current) {
      clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }

    // Only auto-collapse if:
    // 1. Not pinned
    // 2. Not loading an AI response
    // 3. Input is not currently focused
    // 4. User hasn't typed an unsent draft
    if (!isPinned && !isLoading && !isInputFocused && inputText.trim().length === 0) {
      collapseTimerRef.current = setTimeout(() => {
        handleCollapse();
      }, 400);
    }
  };

  const handleTogglePin = () => {
    setIsPinned((prev) => !prev);
  };

  const handleInputFocusChange = (focused: boolean) => {
    setIsInputFocused(focused);
    if (focused) {
      setIsPinned(true);
    }
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (text.trim().length > 0) {
      setIsPinned(true);
    }
  };

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
    if (!trimmed || isLoading || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsPinned(true);
    setIsLoading(true);

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
            isSubmittingRef.current = false;
          },
          onError: (errorDetail: string) => {
            setIsLoading(false);
            isSubmittingRef.current = false;
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
      isSubmittingRef.current = false;
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

  // Keyboard accessibility: Escape collapses back to pill
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded && !isLoading) {
        handleCollapse();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isExpanded, isLoading]);

  // Listen to IPC force-collapse from main process if sent
  useEffect(() => {
    if (window.electronAPI?.onForceCollapse) {
      const unsubscribe = window.electronAPI.onForceCollapse(() => {
        handleCollapse();
      });
      return unsubscribe;
    }
  }, []);

  return (
    <main className="app-container">
      {!isExpanded ? (
        <FloatingPill
          onExpand={handleExpand}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
        />
      ) : (
        <ExpandedPanel
          messages={messages}
          isPinned={isPinned}
          isLoading={isLoading}
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
