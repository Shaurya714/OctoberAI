import React, { useRef, useEffect } from 'react';
import { NeuralTheme, THEME_PALETTES } from '../theme';

export type NeuralState =
  | 'idle'
  | 'hover'
  | 'listening'
  | 'processing'
  | 'responding'
  | 'error'
  | 'expanded';

interface NeuralCoreProps {
  state?: NeuralState;
  theme?: NeuralTheme;
  size?: number; // Visual size in px (e.g. 80 in collapsed, 98 in expanded)
  className?: string;
  isWindowDragging?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}

interface Node3D {
  id: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  projX: number;
  projY: number;
  projScale: number;
  depthAlpha: number;
  freqX: number;
  freqY: number;
  freqZ: number;
  phaseX: number;
  phaseY: number;
  phaseZ: number;
  amp: number;
  baseRadius: number;
  isHub: boolean;
  flash: number;
}

interface Connection {
  i: number;
  j: number;
  dist: number;
  isPrimary: boolean;
}

interface Particle {
  sourceIndex: number;
  targetIndex: number;
  progress: number;
  speed: number;
  size: number;
}

const NODE_COUNT = 68;
const FOCAL_LENGTH = 195;
const HOVER_ROTATION_SENSITIVITY = 0.0042;
const AUTO_YAW_SPEED = 0.055; // Subtle, calm autonomous cosmic drift (rad/s)

export const NeuralCore: React.FC<NeuralCoreProps> = ({
  state = 'idle',
  theme = 'blue',
  size = 80,
  className = '',
  isWindowDragging = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const themeRef = useRef<NeuralTheme>(theme);
  const isDraggingRef = useRef<boolean>(isWindowDragging);

  themeRef.current = theme;
  isDraggingRef.current = isWindowDragging;

  // Simulation persistent state
  const simRef = useRef<{
    nodes: Node3D[];
    connections: Connection[];
    particles: Particle[];
    time: number;
    lastTimestamp: number;
    errorTimer: number;
    // 3D Rotational Inertia State
    rotYaw: number;
    rotPitch: number;
    velYaw: number;
    velPitch: number;
    // Natural Cursor-Controlled 3D Rotation (Hover-Based)
    isHoverActive: boolean;
    lastHoverTime: number;
    lastPointerX: number;
    lastPointerY: number;
  }>({
    nodes: [],
    connections: [],
    particles: [],
    time: 0,
    lastTimestamp: 0,
    errorTimer: 0,
    rotYaw: 0,
    rotPitch: 0.08,
    velYaw: 0,
    velPitch: 0,
    isHoverActive: false,
    lastHoverTime: 0,
    lastPointerX: 0,
    lastPointerY: 0,
  });

  // Initialize spherical 3D volume distribution
  useEffect(() => {
    const nodes: Node3D[] = [];
    const sphereRadius = size * 0.41;

    const pseudo = (seed: number) => {
      const x = Math.sin(seed * 91.345 + 1.234) * 43758.5453;
      return x - Math.floor(x);
    };

    for (let i = 0; i < NODE_COUNT; i++) {
      const u = i / (NODE_COUNT - 1);
      const y = 1 - 2 * u;
      const rCyl = Math.sqrt(Math.max(0, 1 - y * y));
      const goldenAngle = 2.39996323;
      const theta = i * goldenAngle;

      const unitX = rCyl * Math.cos(theta);
      const unitZ = rCyl * Math.sin(theta);

      // Radial distribution throughout the 3D spherical volume
      const radialDistribution = 0.24 + 0.74 * Math.sqrt(0.18 + 0.82 * pseudo(i * 7 + 3));
      const r = sphereRadius * radialDistribution;

      const baseX = unitX * r;
      const baseY = y * r;
      const baseZ = unitZ * r;

      const isHub = i % 9 === 0 || i === 0;
      const baseRadius = isHub ? 2.0 : 1.1 + pseudo(i * 3) * 0.4;

      nodes.push({
        id: i,
        baseX,
        baseY,
        baseZ,
        rotX: baseX,
        rotY: baseY,
        rotZ: baseZ,
        projX: 0,
        projY: 0,
        projScale: 1,
        depthAlpha: 1,
        freqX: 0.09 + pseudo(i * 11) * 0.08,
        freqY: 0.08 + pseudo(i * 13) * 0.08,
        freqZ: 0.10 + pseudo(i * 17) * 0.08,
        phaseX: pseudo(i * 19) * Math.PI * 2,
        phaseY: pseudo(i * 23) * Math.PI * 2,
        phaseZ: pseudo(i * 29) * Math.PI * 2,
        amp: sphereRadius * 0.022,
        baseRadius,
        isHub,
        flash: 0,
      });
    }

    // Stable 3D distance-based connections
    const connections: Connection[] = [];
    const maxConnectDist = sphereRadius * 0.48;
    const nodeConnCounts = new Array(nodes.length).fill(0);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodeConnCounts[i] >= 5 || nodeConnCounts[j] >= 5) continue;

        const d3D = Math.hypot(
          nodes[i].baseX - nodes[j].baseX,
          nodes[i].baseY - nodes[j].baseY,
          nodes[i].baseZ - nodes[j].baseZ
        );

        if (d3D < maxConnectDist) {
          connections.push({
            i,
            j,
            dist: d3D,
            isPrimary: nodes[i].isHub || nodes[j].isHub || d3D < maxConnectDist * 0.62,
          });
          nodeConnCounts[i]++;
          nodeConnCounts[j]++;
        }
      }
    }

    simRef.current.nodes = nodes;
    simRef.current.connections = connections;
    simRef.current.particles = [];
  }, [size]);

  // Error state trigger
  useEffect(() => {
    if (state === 'error') {
      simRef.current.errorTimer = 0.8;
    }
  }, [state]);

  // Natural Cursor-Controlled 3D Rotation (Hover-Based)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // If window is currently being repositioned on the desktop, suspend 3D hover rotation
    if (isDraggingRef.current) return;

    const sim = simRef.current;
    let dX = e.movementX;
    let dY = e.movementY;

    // Fallback if movementX/Y is undefined or zero while coords changed
    if (dX === undefined || (dX === 0 && dY === 0 && sim.lastPointerX !== 0)) {
      dX = e.clientX - sim.lastPointerX;
      dY = e.clientY - sim.lastPointerY;
    }
    sim.lastPointerX = e.clientX;
    sim.lastPointerY = e.clientY;

    if (dX !== undefined && dY !== undefined) {
      // Direct rotational velocity impulse
      const impulseYaw = Math.max(-0.25, Math.min(0.25, dX * HOVER_ROTATION_SENSITIVITY));
      const impulsePitch = Math.max(-0.25, Math.min(0.25, dY * HOVER_ROTATION_SENSITIVITY));

      sim.velYaw = sim.velYaw * 0.4 + impulseYaw * 0.6;
      sim.velPitch = sim.velPitch * 0.4 + impulsePitch * 0.6;
      sim.isHoverActive = true;
      sim.lastHoverTime = performance.now();
    }
  };

  const handlePointerLeave = () => {
    const sim = simRef.current;
    sim.isHoverActive = false;
    sim.lastPointerX = 0;
    sim.lastPointerY = 0;
    if (onMouseLeave) onMouseLeave();
  };

  const handlePointerEnter = () => {
    if (onMouseEnter) onMouseEnter();
  };

  // Main 3D Animation & Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = (timestamp: number) => {
      if (!isRunning) return;

      const sim = simRef.current;
      if (sim.lastTimestamp === 0) {
        sim.lastTimestamp = timestamp;
      }
      const dt = Math.min((timestamp - sim.lastTimestamp) / 1000, 0.08);
      sim.lastTimestamp = timestamp;

      // State speeds & particle traffic
      let speedMult = 1.0;
      let targetParticleCount = 4;
      let filamentAlphaMultiplier = 1.0;

      if (state === 'hover') {
        speedMult = 1.15;
        targetParticleCount = 5;
      } else if (state === 'processing') {
        speedMult = 1.8;
        targetParticleCount = 8;
        filamentAlphaMultiplier = 1.25;
      } else if (state === 'responding') {
        speedMult = 1.4;
        targetParticleCount = 6;
        filamentAlphaMultiplier = 1.15;
      } else if (state === 'expanded') {
        speedMult = 0.95;
        targetParticleCount = 5;
      }

      if (sim.errorTimer > 0) {
        sim.errorTimer = Math.max(0, sim.errorTimer - dt);
      }

      sim.time += dt * speedMult;
      const t = sim.time;

      const width = size;
      const height = size;
      const centerX = width / 2;
      const centerY = height / 2;
      const sphereRadius = size * 0.41;

      // Subtle Breathing Effect
      const breath = 1.0 + 0.022 * Math.sin(t * 1.1);
      const breathLuminosity = 1.0 + 0.06 * Math.sin(t * 1.1);

      // Natural Cursor-Controlled 3D Rotation Physics
      const isWindowDraggingNow = isDraggingRef.current;
      const now = performance.now();
      const timeSinceHover = now - sim.lastHoverTime;

      if (!isWindowDraggingNow && sim.isHoverActive) {
        sim.rotYaw += sim.velYaw;
        sim.rotPitch += sim.velPitch;

        // Smooth fluid damping
        sim.velYaw *= 0.91;
        sim.velPitch *= 0.91;

        // Soft clamp pitch to comfortable viewing range
        sim.rotPitch = Math.max(-0.75, Math.min(0.75, sim.rotPitch));

        // When mouse movement stops, smoothly transition into idle drift
        if (timeSinceHover > 140 && Math.abs(sim.velYaw) < 0.001 && Math.abs(sim.velPitch) < 0.001) {
          sim.isHoverActive = false;
        }
      } else if (!isWindowDraggingNow) {
        // Subtle autonomous cosmic drift
        sim.rotYaw += AUTO_YAW_SPEED * dt;
        // Restorative spring to keep pitch at ideal resting elevation
        sim.rotPitch += (0.08 - sim.rotPitch) * 0.025 * dt * 60;
      }

      // Precalculate rotation matrix (Pitch around horizontal X, Yaw around vertical Y)
      const cosPitch = Math.cos(sim.rotPitch);
      const sinPitch = Math.sin(sim.rotPitch);
      const cosYaw = Math.cos(sim.rotYaw);
      const sinYaw = Math.sin(sim.rotYaw);

      // Error jitter
      const isErrorActive = sim.errorTimer > 0;
      const jitterAmount = isErrorActive ? (sim.errorTimer / 0.8) * 1.8 : 0;

      const nodes = sim.nodes;

      // 1. Transform Nodes in 3D: Slow Organic Drift -> 3D Rotation Matrix -> Perspective Projection
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        const dx = n.amp * Math.sin(n.freqX * t + n.phaseX);
        const dy = n.amp * Math.sin(n.freqY * t + n.phaseY);
        const dz = n.amp * Math.sin(n.freqZ * t + n.phaseZ);

        let curX = (n.baseX + dx) * breath;
        let curY = (n.baseY + dy) * breath;
        let curZ = (n.baseZ + dz) * breath;

        if (jitterAmount > 0) {
          curX += (Math.random() - 0.5) * jitterAmount * 2;
          curY += (Math.random() - 0.5) * jitterAmount * 2;
        }

        // Apply 3D Rotation Matrix:
        // (a) Pitch around horizontal X axis
        const y1 = curY * cosPitch - curZ * sinPitch;
        const z1 = curY * sinPitch + curZ * cosPitch;
        // (b) Yaw around vertical Y axis
        const x2 = curX * cosYaw + z1 * sinYaw;
        const z2 = -curX * sinYaw + z1 * cosYaw;

        n.rotX = x2;
        n.rotY = y1;
        n.rotZ = z2;

        // Perspective 3D projection
        const scale = FOCAL_LENGTH / (FOCAL_LENGTH + z2);
        n.projScale = scale;
        n.projX = centerX + x2 * scale;
        n.projY = centerY + y1 * scale;

        // Depth alpha: Front nodes (z < 0) are clear and luminous; back nodes (z > 0) recede smoothly
        const normZ = (z2 + sphereRadius) / (2 * sphereRadius);
        n.depthAlpha = Math.max(0.24, Math.min(1.0, 1.0 - normZ * 0.65));

        if (n.flash > 0) {
          n.flash = Math.max(0, n.flash - dt * 2.2);
        }
      }

      // 2. Manage Synaptic Traveling Particles
      const connections = sim.connections;
      const particles = sim.particles;

      while (particles.length < targetParticleCount && connections.length > 0) {
        const conn = connections[Math.floor(Math.random() * connections.length)];
        const fromA = Math.random() > 0.5;
        const speed = (0.008 + Math.random() * 0.008) * (state === 'processing' ? 1.5 : 1.0);

        particles.push({
          sourceIndex: fromA ? conn.i : conn.j,
          targetIndex: fromA ? conn.j : conn.i,
          progress: 0,
          speed,
          size: 1.0 + Math.random() * 0.6,
        });
      }

      // Update particles
      for (let pIdx = particles.length - 1; pIdx >= 0; pIdx--) {
        const p = particles[pIdx];
        p.progress += p.speed * (speedMult * 0.9);

        if (p.progress >= 1) {
          if (nodes[p.targetIndex]) {
            nodes[p.targetIndex].flash = 0.45;
          }

          const candidateConns = connections.filter(
            (c) => (c.i === p.targetIndex && c.j !== p.sourceIndex) || (c.j === p.targetIndex && c.i !== p.sourceIndex)
          );

          if (candidateConns.length > 0 && Math.random() > 0.35) {
            const nextConn = candidateConns[Math.floor(Math.random() * candidateConns.length)];
            const nextTarget = nextConn.i === p.targetIndex ? nextConn.j : nextConn.i;
            p.sourceIndex = p.targetIndex;
            p.targetIndex = nextTarget;
            p.progress = 0;
          } else {
            particles.splice(pIdx, 1);
          }
        }
      }

      // ================= DRAWING (Current Theme: Neural Blue or JARVIS Gold) =================
      const currentTheme = themeRef.current;
      const palette = THEME_PALETTES[currentTheme] || THEME_PALETTES.blue;

      ctx.clearRect(0, 0, width, height);

      // (a) Ambient glow with gentle breathing luminosity
      const ambientRadius = sphereRadius * 0.88 * breath;
      const ambientGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, ambientRadius);
      if (isErrorActive) {
        ambientGrad.addColorStop(0, `rgba(239, 68, 68, ${0.14 * (sim.errorTimer / 0.8)})`);
        ambientGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      } else {
        const alphaGlow = (state === 'processing' ? 0.11 : 0.055) * breathLuminosity;
        ambientGrad.addColorStop(0, palette.ambientGlowCenterRgba(alphaGlow));
        ambientGrad.addColorStop(0.5, palette.ambientGlowMidRgba(alphaGlow));
        ambientGrad.addColorStop(1, palette.ambientGlowEdgeRgba);
      }
      ctx.fillStyle = ambientGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, ambientRadius, 0, Math.PI * 2);
      ctx.fill();

      // (b) Draw Connecting Filaments with 3D Depth Layering (Back connections drawn first)
      const sortedConns = [...connections].sort((a, b) => {
        const avgZa = (nodes[a.i].rotZ + nodes[a.j].rotZ) * 0.5;
        const avgZb = (nodes[b.i].rotZ + nodes[b.j].rotZ) * 0.5;
        return avgZb - avgZa; // Back (z > 0) to front (z < 0)
      });

      for (let c = 0; c < sortedConns.length; c++) {
        const conn = sortedConns[c];
        const nA = nodes[conn.i];
        const nB = nodes[conn.j];

        const avgDepth = (nA.depthAlpha + nB.depthAlpha) * 0.5;
        const isForeground = nA.rotZ < 0 && nB.rotZ < 0;

        let strokeColor: string;
        let lineW: number;

        if (isForeground) {
          // Primary Filaments
          const alpha = Math.min(0.85, (0.52 + avgDepth * 0.35) * filamentAlphaMultiplier * breathLuminosity);
          strokeColor = palette.primaryFilamentRgba(alpha);
          lineW = 0.95 + avgDepth * 0.4;
        } else if (nA.rotZ < 0 || nB.rotZ < 0) {
          // Mid Connections (Secondary)
          const alpha = Math.min(0.65, (0.32 + avgDepth * 0.3) * filamentAlphaMultiplier * breathLuminosity);
          strokeColor = palette.secondaryFilamentRgba(alpha);
          lineW = 0.75 + avgDepth * 0.3;
        } else {
          // Background Depth Accents
          const alpha = Math.min(0.38, (0.16 + avgDepth * 0.22) * filamentAlphaMultiplier * breathLuminosity);
          strokeColor = palette.depthAccentRgba(alpha);
          lineW = 0.65;
        }

        ctx.beginPath();
        ctx.moveTo(nA.projX, nA.projY);
        ctx.lineTo(nB.projX, nB.projY);

        if (isErrorActive) {
          ctx.strokeStyle = `rgba(248, 113, 113, ${0.45 + avgDepth * 0.35})`;
        } else {
          ctx.strokeStyle = strokeColor;
        }
        ctx.lineWidth = lineW;
        ctx.stroke();
      }

      // (c) Draw Synaptic Traveling Particles
      for (let pIdx = 0; pIdx < particles.length; pIdx++) {
        const p = particles[pIdx];
        const nA = nodes[p.sourceIndex];
        const nB = nodes[p.targetIndex];
        if (!nA || !nB) continue;

        const prg = p.progress;
        const curX = nA.projX + (nB.projX - nA.projX) * prg;
        const curY = nA.projY + (nB.projY - nA.projY) * prg;
        const curScale = nA.projScale + (nB.projScale - nA.projScale) * prg;
        const curDepthAlpha = nA.depthAlpha + (nB.depthAlpha - nA.depthAlpha) * prg;

        const partRadius = Math.max(0.8, p.size * curScale * 0.9);
        const partAlpha = Math.min(1.0, curDepthAlpha * 1.3);

        // Core packet
        ctx.beginPath();
        ctx.arc(curX, curY, partRadius, 0, Math.PI * 2);
        ctx.fillStyle = palette.particleCoreHex;
        ctx.globalAlpha = partAlpha;
        ctx.fill();

        // Subtle halo
        ctx.beginPath();
        ctx.arc(curX, curY, partRadius * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = palette.particleHaloRgba;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // (d) Draw Individual Nodes (Sorted back-to-front for clean 3D occlusion)
      const sortedNodes = [...nodes].sort((a, b) => b.rotZ - a.rotZ);

      for (let i = 0; i < sortedNodes.length; i++) {
        const n = sortedNodes[i];
        const nodeRadius = Math.max(0.85, Math.min(2.5, n.baseRadius * n.projScale * (1 + n.flash * 0.4)));
        const alpha = Math.min(1.0, (n.depthAlpha + n.flash * 0.45) * breathLuminosity);
        const isFront = n.rotZ < 0;

        ctx.beginPath();
        ctx.arc(n.projX, n.projY, nodeRadius, 0, Math.PI * 2);

        if (isErrorActive) {
          ctx.fillStyle = `rgba(248, 113, 113, ${alpha})`;
        } else if (n.flash > 0.05) {
          ctx.fillStyle = palette.highlightIntersectionRgba(alpha);
        } else if (n.isHub && isFront) {
          // Highlight Intersections (Hubs)
          ctx.fillStyle = palette.highlightIntersectionRgba(alpha);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(n.projX, n.projY, nodeRadius * 1.65, 0, Math.PI * 2);
          ctx.strokeStyle = palette.primaryFilamentRgba(alpha * 0.6);
          ctx.lineWidth = 0.8;
          ctx.stroke();
          continue;
        } else if (isFront) {
          // Front Neural Nodes
          ctx.fillStyle = palette.brightNodeRgba(alpha * 0.95);
        } else {
          // Background Nodes
          ctx.fillStyle = palette.depthAccentRgba(alpha * 0.65);
        }

        ctx.fill();
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [size, state]);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const canvasWidth = Math.round(size * dpr);
  const canvasHeight = Math.round(size * dpr);

  return (
    <div
      className={`neural-core-wrapper ${className}`}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onPointerMove={handlePointerMove}
        onPointerDown={onPointerDown}
        onClick={onClick}
        style={{
          width: size,
          height: size,
          display: 'block',
          cursor: isWindowDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        aria-label="OctoberAI Neural Core"
        role="button"
        tabIndex={0}
      />
    </div>
  );
};
