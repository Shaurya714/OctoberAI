import React from 'react';
import { StatusIndicator } from './StatusIndicator';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { CloseIcon, CollapseIcon, PinIcon } from './Icons';
import { Message } from '../types';

interface ExpandedPanelProps {
  messages: Message[];
  isPinned: boolean;
  isLoading?: boolean;
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
  onTogglePin,
  onCollapse,
  onClose,
  onSendMessage,
  onInputFocusChange,
  onInputChange,
  onMouseEnter,
  onMouseLeave,
}) => {
  return (
    <div
      className="expanded-panel"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="region"
      aria-label="OctoberAI Assistant"
    >
      {/* Header bar: Draggable in empty space, controls are no-drag */}
      <div className="panel-header">
        <div className="header-brand">
          <StatusIndicator status={isLoading ? 'busy' : 'ready'} showLabel />
          <span className="brand-divider">/</span>
          <span className="header-brand-title">OctoberAI</span>
        </div>

        <div className="header-controls">
          <button
            type="button"
            className={`control-btn ${isPinned ? 'control-btn-active' : ''}`}
            onClick={onTogglePin}
            title={isPinned ? 'Unpin window (allow auto-collapse)' : 'Pin window open'}
            aria-label={isPinned ? 'Unpin window' : 'Pin window open'}
          >
            <PinIcon size={13} pinned={isPinned} />
          </button>

          <button
            type="button"
            className="control-btn"
            onClick={onCollapse}
            title="Collapse to pill (Esc)"
            aria-label="Collapse to pill"
          >
            <CollapseIcon size={14} />
          </button>

          <button
            type="button"
            className="control-btn control-btn-close"
            onClick={onClose}
            title="Close OctoberAI"
            aria-label="Close application"
          >
            <CloseIcon size={13} />
          </button>
        </div>
      </div>

      {/* Main Conversation Body */}
      <ChatArea messages={messages} isLoading={isLoading} />

      {/* Input & Action Area */}
      <ChatInput
        onSendMessage={onSendMessage}
        onFocusChange={onInputFocusChange}
        onInputChange={onInputChange}
        isLoading={isLoading}
      />
    </div>
  );
};
