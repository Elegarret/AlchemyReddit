import { type ComponentType, type CSSProperties } from 'react';

export type Element = {
  id: string;
  name: string;
  x: number;
  y: number;
  icon?: ElementIcon;
  hint?: string;
};

export type ElementIcon = string | ComponentType<{ size?: number }>;

export type SnowBackdropFlakeStyle = CSSProperties & {
  '--snow-opacity': string;
  '--snow-mid-x': string;
  '--snow-mid-y': string;
  '--snow-end-x': string;
  '--snow-end-y': string;
  '--snow-scale-start': string;
  '--snow-scale-peak': string;
  '--snow-scale-end': string;
};

export type FairyGlitterStyle = CSSProperties & {
  '--glitter-drift-x': string;
  '--glitter-drift-y': string;
  '--glitter-size': string;
};
