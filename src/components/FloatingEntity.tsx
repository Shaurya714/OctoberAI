import React, { useState, useRef, useEffect } from 'react';
import { NeuralCore, NeuralState } from './NeuralCore';
import { NeuralTheme } from '../theme';

interface FloatingEntityProps {
  onExpand: (pinned: boolean) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  state?: NeuralState;
  theme?: NeuralTheme;
}

const DRAG_THRESHOLD = 6; // 6px threshold to distinguish click from window drag

export const FloatingEntity: React.FC<FloatingEntityProps> = ({
  onExpand,
  onHoverStart,
  onHoverEnd,
  state = 'idle',
  theme = 'blue',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);

  const dragTrackingRef = useRef<{
    isPointerDown: boolean;
    hasDragged: boolean;
    startScreenX: number;
    startScreenY: number;
    lastScreenX: number;
    lastScreenY: number;
  }>({
    isPointerDown: false,
    hasDragged: false,
    startScreenX: 0,
    startScreenY: 0,
    lastScreenX: 0,
    lastScreenY: 0,
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Left click only

    const tracker = dragTrackingRef.current;
    tracker.isPointerDown = true;
    tracker.hasDragged = false;
    tracker.startScreenX = e.screenX;
    tracker.startScreenY = e.screenY;
    tracker.lastScreenX = e.screenX;
    tracker.lastScreenY = e.screenY;

    const handleWindowPointerMove = (moveEvt: PointerEvent) => {
      if (!tracker.isPointerDown) return;

      const totalDist = Math.hypot(
        moveEvt.screenX - tracker.startScreenX,
        moveEvt.screenY - tracker.startScreenY
      );

      // Once threshold is passed, classify permanently as a window drag
      if (!tracker.hasDragged && totalDist >= DRAG_THRESHOLD) {
        tracker.hasDragged = true;
        setIsWindowDragging(true);
        document.body.style.cursor = 'grabbing';
      }

      if (tracker.hasDragged) {
        const deltaX = moveEvt.screenX - tracker.lastScreenX;
        const deltaY = moveEvt.screenY - tracker.lastScreenY;

        tracker.lastScreenX = moveEvt.screenX;
        tracker.lastScreenY = moveEvt.screenY;

        if (window.electronAPI?.moveWindow && (deltaX !== 0 || deltaY !== 0)) {
          window.electronAPI.moveWindow(deltaX, deltaY);
        }
      }
    };

    const handleWindowPointerUp = (upEvt: PointerEvent) => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);

      document.body.style.cursor = '';

      const totalDist = Math.hypot(
        upEvt.screenX - tracker.startScreenX,
        upEvt.screenY - tracker.startScreenY
      );

      const didDrag = tracker.hasDragged || totalDist >= DRAG_THRESHOLD;
      tracker.isPointerDown = false;

      if (didDrag) {
        // Drag finished: suppress click and never expand
        setTimeout(() => {
          tracker.hasDragged = false;
          setIsWindowDragging(false);
        }, 50);
      } else {
        // Pointer was released without dragging (< 6px): intentional click to expand!
        tracker.hasDragged = false;
        setIsWindowDragging(false);
        onExpand(true);
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHoverStart();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHoverEnd();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onExpand(true);
    }
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  const currentState: NeuralState = state !== 'idle' ? state : isHovered ? 'hover' : 'idle';

  return (
    <div
      className="floating-entity-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`floating-entity-core ${isWindowDragging ? 'dragging-core' : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        aria-label="OctoberAI Neural Companion"
        title="Click to open OctoberAI • Drag to reposition assistant • Hover to rotate sphere"
      >
        <NeuralCore
          size={80}
          state={currentState}
          theme={theme}
          isWindowDragging={isWindowDragging}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />

        {/* Breathing aura halo behind core */}
        <div className={`core-aura-halo ${isHovered ? 'core-aura-halo-hover' : ''}`} />
      </div>
    </div>
  );
};
