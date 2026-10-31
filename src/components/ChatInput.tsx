import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, MicIcon, ScreenIcon, LoadingSpinnerIcon } from './Icons';
import { AudioInputSource } from '../services/audioCapture';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  onInputChange: (text: string) => void;
  isLoading?: boolean;
  isVoiceListening?: boolean;
  voiceInputSource?: AudioInputSource;
  onToggleVoice?: () => void;
  onChangeVoiceSource?: (source: AudioInputSource) => void;
  onToggleScreenAwareness?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onFocusChange,
  onInputChange,
  isLoading = false,
  isVoiceListening = false,
  voiceInputSource = 'microphone',
  onToggleVoice,
  onChangeVoiceSource,
  onToggleScreenAwareness,
}) => {
  const [inputText, setInputText] = useState('');
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Dismiss audio source popover on outside click
  useEffect(() => {
    if (!showSourceMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setShowSourceMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSourceMenu]);

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
    if (onToggleVoice) {
      onToggleVoice();
    }
  };

  const handleScreenClick = () => {
    if (onToggleScreenAwareness) {
      onToggleScreenAwareness();
    }
  };

  return (
    <div className="chat-input-wrapper">
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            className="chat-text-input"
            placeholder={
              isVoiceListening
                ? 'Listening to speech...'
                : isLoading
                ? 'October is responding...'
                : 'Ask October...'
            }
            value={inputText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            disabled={isLoading}
            aria-label="Ask October"
          />

          {/* Quick mic control beside text input */}
          <button
            type="button"
            className={`input-inline-btn mic-inline-btn ${
              isVoiceListening ? 'mic-inline-active' : ''
            }`}
            onClick={handleMicClick}
            title={
              isVoiceListening
                ? 'Click to stop listening'
                : `Activate voice mode (${voiceInputSource === 'system' ? 'System Audio' : 'Microphone'})`
            }
            aria-label={isVoiceListening ? 'Stop voice listening' : 'Start voice listening'}
            aria-pressed={isVoiceListening}
          >
            <MicIcon size={14} />
          </button>

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
            {/* Voice Mode Action */}
            <div className="voice-toolbar-group" ref={sourceMenuRef}>
              <button
                type="button"
                className={`toolbar-btn feature-btn ${isVoiceListening ? 'feature-btn-active' : ''}`}
                onClick={handleMicClick}
                title={isVoiceListening ? 'Stop voice listening' : 'Activate Voice Mode'}
                aria-label={isVoiceListening ? 'Stop voice listening' : 'Activate Voice Mode'}
                aria-pressed={isVoiceListening}
              >
                <MicIcon size={14} />
                <span className="toolbar-btn-text">
                  {isVoiceListening ? 'Listening' : 'Voice'}
                </span>
                {isVoiceListening && <span className="mic-pulse-dot" />}
              </button>

              {/* Input Source Selector Chip */}
              <button
                type="button"
                className="toolbar-source-chip"
                onClick={() => setShowSourceMenu((prev) => !prev)}
                title="Select Audio Input Source (Microphone vs. System Audio)"
                aria-label="Audio input source"
                aria-haspopup="true"
                aria-expanded={showSourceMenu}
              >
                <span className="source-label">
                  {voiceInputSource === 'system' ? 'Sys Audio' : 'Mic'}
                </span>
                <span className="source-caret">▾</span>
              </button>

              {showSourceMenu && (
                <div className="audio-source-menu" role="menu" aria-label="Audio Input Source">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={voiceInputSource === 'microphone'}
                    className={`source-menu-item ${
                      voiceInputSource === 'microphone' ? 'source-menu-item-active' : ''
                    }`}
                    onClick={() => {
                      if (onChangeVoiceSource) onChangeVoiceSource('microphone');
                      setShowSourceMenu(false);
                    }}
                  >
                    <span className="item-title">Microphone</span>
                    <span className="item-desc">Physical microphone capture</span>
                  </button>

                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={voiceInputSource === 'system'}
                    className={`source-menu-item ${
                      voiceInputSource === 'system' ? 'source-menu-item-active' : ''
                    }`}
                    onClick={() => {
                      if (onChangeVoiceSource) onChangeVoiceSource('system');
                      setShowSourceMenu(false);
                    }}
                  >
                    <span className="item-title">System Audio</span>
                    <span className="item-desc">Computer loopback audio</span>
                  </button>
                </div>
              )}
            </div>

            {/* Screen Awareness Action */}
            <button
              type="button"
              className="toolbar-btn feature-btn"
              onClick={handleScreenClick}
              title="Activate Screen Awareness Mode"
              aria-label="Activate Screen Awareness Mode"
            >
              <ScreenIcon size={14} />
              <span className="toolbar-btn-text">Screen</span>
            </button>
          </div>

          <div className="toolbar-hint">
            <span>
              {isVoiceListening
                ? 'Speak now • Click mic to stop'
                : isLoading
                ? 'Thinking...'
                : 'Press ↵ to send'}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
};
