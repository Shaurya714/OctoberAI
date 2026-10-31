import React from 'react';
import { FloatingEntity } from './FloatingEntity';
import { NeuralState } from './NeuralCore';
import { NeuralTheme } from '../theme';

interface FloatingPillProps {
  onExpand: (pinned: boolean) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  state?: NeuralState;
  theme?: NeuralTheme;
}

export const FloatingPill: React.FC<FloatingPillProps> = ({
  onExpand,
  onHoverStart,
  onHoverEnd,
  state = 'idle',
  theme = 'blue',
}) => {
  return (
    <FloatingEntity
      onExpand={onExpand}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      state={state}
      theme={theme}
    />
  );
};
