export const COLOR_KEYS = ['blue', 'green', 'yellow', 'orange', 'purple', 'pink'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** Accent bar colour per task colour (shared by light and dark themes). */
export const COLOR_BAR: Record<ColorKey, string> = {
  blue: '#4F7FE8',
  green: '#3FB177',
  yellow: '#E5BA1E',
  orange: '#F28B32',
  purple: '#8A6BE2',
  pink: '#E56096',
};

export function isColorKey(value: unknown): value is ColorKey {
  return typeof value === 'string' && (COLOR_KEYS as readonly string[]).includes(value);
}

export function randomColor(): ColorKey {
  return COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
}

/** CSS class that sets --chip-bg / --chip-bar / --chip-ink for the current theme. */
export const chipClass = (color: ColorKey) => `chip-${color}`;
