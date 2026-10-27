import React, { useEffect, useRef } from 'react';
import { Message } from '../types';

interface ChatAreaProps {
  messages: Message[];
  isLoading?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ messages, isLoading = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div className="chat-area" ref={scrollRef} tabIndex={0} aria-label="Conversation history">
      <div className="welcome-banner">
        <div className="welcome-title">Welcome to OctoberAI</div>
      </div>

      <div className="messages-list" role="log" aria-live="polite">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-bubble-wrapper message-${msg.sender} ${
              msg.isError ? 'message-error' : ''
            }`}
          >
            <div className="message-bubble">
              {msg.sender === 'assistant' && (
                <div className="message-header-meta">
                  <span className="assistant-label">OctoberAI</span>
                  {msg.model && <span className="model-badge">{msg.model}</span>}
                </div>
              )}
              {msg.isError && (
                <div className="message-header-meta">
                  <span className="error-badge">Notice</span>
                </div>
              )}
              <p className="message-text">{msg.text}</p>
              <span className="message-timestamp">{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message-bubble-wrapper message-assistant message-loading">
            <div className="message-bubble">
              <div className="message-header-meta">
                <span className="assistant-label">OctoberAI</span>
              </div>
              <div className="typing-indicator" aria-label="OctoberAI is thinking">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
