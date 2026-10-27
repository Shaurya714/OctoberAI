import React from 'react';
import { CompanionStatus } from '../types';

interface StatusIndicatorProps {
  status?: CompanionStatus;
  showLabel?: boolean;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status = 'ready',
  showLabel = false,
  className = '',
}) => {
  const getStatusText = () => {
    switch (status) {
      case 'busy':
        return 'Busy';
      case 'idle':
        return 'Idle';
      case 'ready':
      default:
        return 'Ready';
    }
  };

  return (
    <div
      className={`status-indicator-container ${className}`}
      title={`Status: ${getStatusText()}`}
      role="status"
      aria-label={`Companion status: ${getStatusText()}`}
    >
      <span className={`status-dot status-${status}`}>
        <span className="status-dot-pulse" aria-hidden="true" />
      </span>
      {showLabel && <span className="status-label">{getStatusText()}</span>}
    </div>
  );
};
