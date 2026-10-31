import React, { useRef, useEffect } from 'react';
import { NeuralTheme, THEME_PALETTES } from '../theme';

interface ClusterExpansionTransitionProps {
  theme: NeuralTheme;
  onComplete: () => void;
}

interface ExpandNode {
  baseClusterX: number;
  baseClusterY: number;
  targetX: number;
  targetY: number;
  radius: number;
  cornerIndex: number;
}

export const ClusterExpansionTransition: React.FC<ClusterExpansionTransitionProps> = ({
  theme,
  onComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const palette = THEME_PALETTES[theme] || THEME_PALETTES.blue;

    // Requirement 3: Animation MUST originate from the centre of the actual available display
    const originX = width / 2;
    const originY = height / 2;

    const nodeCount = 56;
    const nodes: ExpandNode[] = [];

    // Four target corners matching ScreenCornerIndicators
    const corners = [
      { x: 18, y: 18 },                  // Top-Left
      { x: width - 18, y: 18 },          // Top-Right
      { x: 18, y: height - 18 },         // Bottom-Left
      { x: width - 18, y: height - 18 }, // Bottom-Right
    ];

    // Seed compact neural core in display centre
    const compactRadius = 42;
    for (let i = 0; i < nodeCount; i++) {
      const angle = (i / nodeCount) * Math.PI * 2;
      const r = (0.2 + 0.8 * Math.sqrt((i % 7) / 7)) * compactRadius;
      const startX = originX + Math.cos(angle) * r;
      const startY = originY + Math.sin(angle) * r;

      const cornerIdx = i % 4;
      const targetCorner = corners[cornerIdx];
      // Scatter smoothly towards corner region
      const scatterX = targetCorner.x + (Math.random() - 0.5) * 120;
      const scatterY = targetCorner.y + (Math.random() - 0.5) * 120;

      nodes.push({
        baseClusterX: startX,
        baseClusterY: startY,
        targetX: scatterX,
        targetY: scatterY,
        radius: 1.2 + (i % 5 === 0 ? 1.4 : 0.4),
        cornerIndex: cornerIdx,
      });
    }

    let startTime = performance.now();
    const duration = 850; // ms
    let animId: number;

    const render = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Smooth cubic ease out
      const ease = 1 - Math.pow(1 - progress, 3);
      const globalAlpha = progress < 0.6 ? 1 : Math.max(0, (1 - progress) / 0.4);

      ctx.clearRect(0, 0, width, height);

      // 1. Central Ambient Glow that dissolves as cluster expands
      if (progress < 0.7) {
        const glowRadius = compactRadius * (1 + ease * 1.8);
        const glowAlpha = (1 - progress / 0.7) * 0.18;
        const grad = ctx.createRadialGradient(originX, originY, 0, originX, originY, glowRadius);
        grad.addColorStop(0, palette.ambientGlowCenterRgba(glowAlpha));
        grad.addColorStop(0.6, palette.ambientGlowMidRgba(glowAlpha * 0.5));
        grad.addColorStop(1, palette.ambientGlowEdgeRgba);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(originX, originY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Calculate current interpolated positions
      const curPositions: Array<{ x: number; y: number }> = new Array(nodes.length);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        curPositions[i] = {
          x: n.baseClusterX + (n.targetX - n.baseClusterX) * ease,
          y: n.baseClusterY + (n.targetY - n.baseClusterY) * ease,
        };
      }

      // 2. Filaments connecting expanding nodes
      for (let i = 0; i < nodes.length; i++) {
        const posA = curPositions[i];
        for (let j = i + 1; j < nodes.length; j++) {
          // Connect nodes in same branch or nearby
          const posB = curPositions[j];
          const dist = Math.hypot(posA.x - posB.x, posA.y - posB.y);
          const maxDist = 95 * (1 + (1 - ease) * 0.5);

          if (dist < maxDist) {
            const filamentAlpha = (1 - dist / maxDist) * globalAlpha * 0.48;
            ctx.beginPath();
            ctx.moveTo(posA.x, posA.y);
            ctx.lineTo(posB.x, posB.y);
            ctx.strokeStyle = palette.primaryFilamentRgba(filamentAlpha);
            ctx.lineWidth = 0.85;
            ctx.stroke();
          }
        }
      }

      // 3. Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pos = curPositions[i];
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, n.radius * (1 + ease * 0.25), 0, Math.PI * 2);
        ctx.fillStyle = palette.brightNodeRgba(globalAlpha * 0.92);
        ctx.fill();
      }

      if (progress < 1) {
        animId = requestAnimationFrame(render);
      } else {
        onComplete();
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [theme, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="cluster-expansion-canvas"
      aria-hidden="true"
    />
  );
};
