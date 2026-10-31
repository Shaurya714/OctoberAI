import React, { useState, useRef, useEffect } from 'react';
import { StatusIndicator } from './StatusIndicator';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { CloseIcon, CollapseIcon, PinIcon, PaletteIcon, CheckIcon } from './Icons';
import { Message } from '../types';
import { NeuralCore, NeuralState } from './NeuralCore';
import { NeuralTheme } from '../theme';

interface ExpandedPanelProps {
  messages: Message[];
  isPinned: boolean;
  isLoading?: boolean;
  neuralState?: NeuralState;
  theme?: NeuralTheme;
  onSelectTheme: (theme: NeuralTheme) => void;
  onTogglePin: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  onInputFocusChange: (focused: boolean) => void;
  onInputChange: (text: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const ExpandedPanel: React.FC<ExpandedPanelProps> = ({
  messages,
  isPinned,
  isLoading = false,
  neuralState = 'expanded',
  theme = 'blue',
  onSelectTheme,
  onTogglePin,
  onCollapse,
  onClose,
  onSendMessage,
  onInputFocusChange,
  onInputChange,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeSelectorRef = useRef<HTMLDivElement | null>(null);

  // Close theme menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isThemeMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (themeSelectorRef.current && !themeSelectorRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isThemeMenuOpen]);

  return (
    <div
      className="expanded-neural-container"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="region"
      aria-label="OctoberAI Neural Assistant"
    >
      {/* 1. Top Neural Masthead with draggable anchor and controls */}
      <div className="neural-masthead">
        {/* Subtle controls row */}
        <div className="masthead-controls-bar">
          <div className="masthead-status">
            <StatusIndicator status={isLoading ? 'busy' : 'ready'} showLabel />
          </div>

          <div className="masthead-actions">
            {/* Theme Selector Popover */}
            <div className="theme-selector-container" ref={themeSelectorRef}>
              <button
                type="button"
                className={`control-btn ${isThemeMenuOpen ? 'control-btn-active' : ''}`}
                onClick={() => setIsThemeMenuOpen((prev) => !prev)}
                title="Switch neural theme"
                aria-label="Switch neural theme"
                aria-expanded={isThemeMenuOpen}
                aria-haspopup="true"
              >
                <PaletteIcon size={13} />
              </button>

              {isThemeMenuOpen && (
                <div
                  className="theme-popover"
                  role="menu"
                  aria-label="Neural Theme Options"
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === 'blue'}
                    className={`theme-option ${theme === 'blue' ? 'theme-option-active' : ''}`}
                    onClick={() => {
                      onSelectTheme('blue');
                      setIsThemeMenuOpen(false);
                    }}
                  >
                    <span className="theme-swatch theme-swatch-blue" aria-hidden="true" />
                    <span className="theme-label">Neural Blue</span>
                    {theme === 'blue' && <CheckIcon size={11} className="theme-check-icon" />}
                  </button>

                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === 'gold'}
                    className={`theme-option ${theme === 'gold' ? 'theme-option-active' : ''}`}
                    onClick={() => {
                      onSelectTheme('gold');
                      setIsThemeMenuOpen(false);
                    }}
                  >
                    <span className="theme-swatch theme-swatch-gold" aria-hidden="true" />
                    <span className="theme-label">JARVIS Gold</span>
                    {theme === 'gold' && <CheckIcon size={11} className="theme-check-icon" />}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className={`control-btn ${isPinned ? 'control-btn-active' : ''}`}
              onClick={onTogglePin}
              title={isPinned ? 'Unpin window (allow auto-collapse)' : 'Pin window open'}
              aria-label={isPinned ? 'Unpin window' : 'Pin window open'}
            >
              <PinIcon size={12} pinned={isPinned} />
            </button>

            <button
              type="button"
              className="control-btn"
              onClick={onCollapse}
              title="Collapse to neural core (Esc)"
              aria-label="Collapse to neural core"
            >
              <CollapseIcon size={13} />
            </button>

            <button
              type="button"
              className="control-btn control-btn-close"
              onClick={onClose}
              title="Close OctoberAI"
              aria-label="Close application"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        </div>

        {/* Floating Neural Core at top center */}
        <div className="masthead-core-wrapper">
          <NeuralCore
            size={98}
            state={neuralState}
            theme={theme}
            className="masthead-neural-core"
          />
        </div>

        {/* Luminous neural connection filament leading into the chat surface */}
        <div className="neural-conduit-line" aria-hidden="true" />
      </div>

      {/* 2. Translucent Conversation Surface */}
      <div className="conversation-surface">
        {/* Chat Messages */}
        <ChatArea messages={messages} isLoading={isLoading} />

        {/* Chat Input & Actions */}
        <ChatInput
          onSendMessage={onSendMessage}
          onFocusChange={onInputFocusChange}
          onInputChange={onInputChange}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
