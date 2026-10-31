export type NeuralTheme = 'blue' | 'gold';

export interface CanvasPalette {
  environment: string;
  primaryFilamentHex: string;
  secondaryFilamentHex: string;
  brightNodeHex: string;
  highlightIntersectionHex: string;
  depthAccentHex: string;
  textPrimaryHex: string;
  // RGBA generators for dynamic alpha blending
  primaryFilamentRgba: (alpha: number) => string;
  secondaryFilamentRgba: (alpha: number) => string;
  depthAccentRgba: (alpha: number) => string;
  brightNodeRgba: (alpha: number) => string;
  highlightIntersectionRgba: (alpha: number) => string;
  ambientGlowCenterRgba: (alpha: number) => string;
  ambientGlowMidRgba: (alpha: number) => string;
  ambientGlowEdgeRgba: string;
  particleCoreHex: string;
  particleHaloRgba: string;
}

export const THEME_PALETTES: Record<NeuralTheme, CanvasPalette> = {
  blue: {
    environment: '#07111F',
    primaryFilamentHex: '#35C9F4',
    secondaryFilamentHex: '#2876C7',
    brightNodeHex: '#A8E9FF',
    highlightIntersectionHex: '#E8FAFF',
    depthAccentHex: '#526FAF',
    textPrimaryHex: '#E8FAFF',
    primaryFilamentRgba: (a: number) => `rgba(53, 201, 244, ${a})`,
    secondaryFilamentRgba: (a: number) => `rgba(40, 118, 199, ${a})`,
    depthAccentRgba: (a: number) => `rgba(82, 111, 175, ${a})`,
    brightNodeRgba: (a: number) => `rgba(168, 233, 255, ${a})`,
    highlightIntersectionRgba: (a: number) => `rgba(232, 250, 255, ${a})`,
    ambientGlowCenterRgba: (a: number) => `rgba(53, 201, 244, ${a})`,
    ambientGlowMidRgba: (a: number) => `rgba(40, 118, 199, ${a * 0.45})`,
    ambientGlowEdgeRgba: 'rgba(7, 17, 31, 0)',
    particleCoreHex: '#E8FAFF',
    particleHaloRgba: 'rgba(53, 201, 244, 0.32)',
  },
  gold: {
    // JARVIS Gold: deep midnight navy background, champagne gold, antique bronze, warm pale gold
    environment: '#080D18',
    primaryFilamentHex: '#D9A441',
    secondaryFilamentHex: '#916B32',
    brightNodeHex: '#FFE3A1',
    highlightIntersectionHex: '#FFF2D1',
    depthAccentHex: '#B98232',
    textPrimaryHex: '#F3E8D0',
    primaryFilamentRgba: (a: number) => `rgba(217, 164, 65, ${a})`,
    secondaryFilamentRgba: (a: number) => `rgba(145, 107, 50, ${a})`,
    depthAccentRgba: (a: number) => `rgba(185, 130, 50, ${a})`,
    brightNodeRgba: (a: number) => `rgba(255, 227, 161, ${a})`,
    highlightIntersectionRgba: (a: number) => `rgba(255, 242, 209, ${a})`,
    ambientGlowCenterRgba: (a: number) => `rgba(217, 164, 65, ${a})`,
    ambientGlowMidRgba: (a: number) => `rgba(145, 107, 50, ${a * 0.45})`,
    ambientGlowEdgeRgba: 'rgba(8, 13, 24, 0)',
    particleCoreHex: '#FFF2D1',
    particleHaloRgba: 'rgba(217, 164, 65, 0.32)',
  },
};

export const THEME_STORAGE_KEY = 'october_neural_theme';

export function getSavedTheme(): NeuralTheme {
  if (typeof window === 'undefined') return 'blue';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'gold' || saved === 'blue') {
      return saved;
    }
  } catch (e) {
    console.warn('Could not read theme from localStorage', e);
  }
  return 'blue';
}

export function saveTheme(theme: NeuralTheme): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    console.warn('Could not save theme to localStorage', e);
  }
}
