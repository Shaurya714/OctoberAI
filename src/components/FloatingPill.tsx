import React from 'react';
import { StatusIndicator } from './StatusIndicator';
import { DragGripIcon } from './Icons';

interface FloatingPillProps {
  onExpand: (pinned: boolean) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

export const FloatingPill: React.FC<FloatingPillProps> = ({
  onExpand,
  onHoverStart,
  onHoverEnd,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExpand(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onExpand(true);
    }
  };

  return (
    <div
      className="floating-pill-container"
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div
        className="floating-pill"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label="Expand OctoberAI companion"
        title="Click or hover to expand OctoberAI"
      >
        <div
          className="pill-drag-grip"
          title="Drag window"
          aria-hidden="true"
        >
          <DragGripIcon size={10} />
        </div>

        <div className="pill-content">
          <StatusIndicator status="ready" />
          <span className="pill-brand-text">OctoberAI</span>
        </div>
      </div>
    </div>
  );
};
