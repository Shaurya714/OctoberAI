import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, MicIcon, ScreenIcon, LoadingSpinnerIcon } from './Icons';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  onInputChange: (text: string) => void;
  isLoading?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onFocusChange,
  onInputChange,
  isLoading = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [screenContextActive, setScreenContextActive] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus input when opened
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const showTooltip = (msg: string) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    setTooltip(msg);
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip(null);
    }, 2200);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);
    onInputChange(text);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;
    const trimmed = inputText.trim();
    if (!trimmed) return;

    onSendMessage(trimmed);
    setInputText('');
    onInputChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMicClick = () => {
    showTooltip('Voice Input — Coming Soon');
  };

  const handleScreenContextClick = () => {
    showTooltip('Screen Context — Coming Soon');
    setScreenContextActive(false);
  };

  return (
    <div className="chat-input-wrapper">
      {tooltip && (
        <div className="coming-soon-tooltip" role="status" aria-live="polite">
          <span className="tooltip-badge">Coming Soon</span>
          <span className="tooltip-message">{tooltip}</span>
        </div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            className="chat-text-input"
            placeholder={isLoading ? 'OctoberAI is responding...' : 'Ask OctoberAI...'}
            value={inputText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            disabled={isLoading}
            aria-label="Ask OctoberAI"
          />

          <button
            type="submit"
            className={`send-button ${
              inputText.trim() && !isLoading ? 'send-button-active' : ''
            }`}
            disabled={isLoading || !inputText.trim()}
            title={isLoading ? 'Generating response...' : 'Send message (Enter)'}
            aria-label={isLoading ? 'Generating response' : 'Send message'}
          >
            {isLoading ? <LoadingSpinnerIcon size={14} /> : <SendIcon size={14} />}
          </button>
        </div>

        <div className="input-toolbar">
          <div className="toolbar-actions">
            <button
              type="button"
              className="toolbar-btn feature-btn"
              onClick={handleMicClick}
              title="Voice Input (Coming Soon)"
              aria-label="Voice Input (Coming Soon)"
            >
              <MicIcon size={14} />
              <span className="toolbar-btn-text">Voice</span>
              <span className="badge-pill">Soon</span>
            </button>

            <button
              type="button"
              className={`toolbar-btn feature-btn ${
                screenContextActive ? 'active' : ''
              }`}
              onClick={handleScreenContextClick}
              title="Screen Context (Coming Soon)"
              aria-label="Screen Context (Coming Soon)"
            >
              <ScreenIcon size={14} />
              <span className="toolbar-btn-text">Screen</span>
              <span className="badge-pill">Soon</span>
            </button>
          </div>

          <div className="toolbar-hint">
            <span>{isLoading ? 'Thinking...' : 'Press ↵ to send'}</span>
          </div>
        </div>
      </form>
    </div>
  );
};
