import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, MicIcon, ScreenIcon, LoadingSpinnerIcon, VolumeIcon, CheckIcon } from './Icons';
import { AudioInputSource } from '../services/audioCapture';
import { InputModality } from '../types';

interface ChatInputProps {
  onSendMessage: (text: string, modality?: InputModality) => void;
  onFocusChange: (focused: boolean) => void;
  onInputChange: (text: string) => void;
  isLoading?: boolean;
  isVoiceListening?: boolean;
  voiceTranscript?: string;
  voiceInputSource?: AudioInputSource;
  speakResponsesEnabled?: boolean;
  onToggleSpeakResponses?: () => void;
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
  voiceTranscript = '',
  voiceInputSource = 'microphone',
  speakResponsesEnabled = false,
  onToggleSpeakResponses,
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

  // Live voice composer: streaming recognized words directly into the composer input
  useEffect(() => {
    if (isVoiceListening && voiceTranscript !== undefined) {
      setInputText(voiceTranscript);
      onInputChange(voiceTranscript);
    }
  }, [isVoiceListening, voiceTranscript, onInputChange]);

  // Dismiss audio source popover on outside click or Escape key
  useEffect(() => {
    if (!showSourceMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setShowSourceMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSourceMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
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

    onSendMessage(trimmed, 'text');
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
                ? 'Listening... Speak now (words will appear here)'
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
                ? 'Click to stop listening and send'
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

        {/* Minimal Command Dock */}
        <div className="command-dock" role="toolbar" aria-label="Command Dock">
          {/* Group A & B: Voice Input (Primary) and Screen Awareness (Secondary) */}
          <div className="dock-left-group">
            {/* A. Voice Input Prominent Primary Control */}
            <div
              className={`dock-voice-control ${
                isVoiceListening ? 'voice-active voice-state-listening' : 'voice-state-idle'
              }`}
              ref={sourceMenuRef}
            >
              <button
                type="button"
                className="dock-voice-main-btn"
                onClick={handleMicClick}
                title={
                  isVoiceListening
                    ? 'Click to stop listening and send'
                    : `Activate Voice (${voiceInputSource === 'system' ? 'System Audio' : 'Microphone'})`
                }
                aria-label={isVoiceListening ? 'Stop voice listening' : 'Activate Voice Mode'}
                aria-pressed={isVoiceListening}
              >
                <MicIcon size={13} className="dock-icon" />
                <span className="dock-label">
                  {isVoiceListening ? 'Listening' : 'Voice'}
                </span>
                {isVoiceListening && <span className="dock-pulse-dot" aria-hidden="true" />}
              </button>

              <button
                type="button"
                className={`dock-voice-caret-btn ${showSourceMenu ? 'caret-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSourceMenu((prev) => !prev);
                }}
                title="Select Audio Input Source (Microphone vs. System Audio)"
                aria-label="Select audio input source"
                aria-haspopup="true"
                aria-expanded={showSourceMenu}
              >
                <span className="dock-caret" aria-hidden="true">▾</span>
              </button>

              {/* Integrated Audio Source Dropdown Popover */}
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
                    <div className="source-menu-row">
                      <span className="item-title">Microphone</span>
                      {voiceInputSource === 'microphone' && (
                        <CheckIcon size={11} className="source-check-icon" />
                      )}
                    </div>
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
                    <div className="source-menu-row">
                      <span className="item-title">System Audio</span>
                      {voiceInputSource === 'system' && (
                        <CheckIcon size={11} className="source-check-icon" />
                      )}
                    </div>
                    <span className="item-desc">Computer loopback audio</span>
                  </button>
                </div>
              )}
            </div>

            {/* B. Screen Awareness Secondary Control */}
            <button
              type="button"
              className="dock-btn dock-screen-btn"
              onClick={handleScreenClick}
              title="Activate Screen Awareness Mode"
              aria-label="Activate Screen Awareness Mode"
            >
              <ScreenIcon size={13} className="dock-icon" />
              <span className="dock-label">Screen</span>
            </button>
          </div>

          {/* Group C: Speech Output Independent Preference with Micro Switch */}
          <div className="dock-right-group">
            <button
              type="button"
              className={`dock-toggle-btn speak-responses-btn ${
                speakResponsesEnabled ? 'dock-toggle-active speak-responses-active' : ''
              }`}
              onClick={onToggleSpeakResponses}
              title="Speak responses to typed messages as well."
              aria-label="Toggle speaking replies to typed messages"
              role="switch"
              aria-checked={speakResponsesEnabled}
            >
              <VolumeIcon size={13} enabled={speakResponsesEnabled} className="dock-icon" />
              <span className="dock-label">Speak replies</span>
              <span
                className={`dock-switch-track ${speakResponsesEnabled ? 'switch-on' : 'switch-off'}`}
                aria-hidden="true"
              >
                <span className="dock-switch-thumb" />
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
