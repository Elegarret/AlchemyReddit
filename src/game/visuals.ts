import { type CSSProperties } from 'react';
import { type SnowBackdropFlakeStyle } from './types';

export const createSnowBackdropFlakes = (): SnowBackdropFlakeStyle[] =>
  Array.from({ length: 34 }, () => {
    const size = 3 + Math.random() * 5;
    const blur = Math.random() * 1.1;

    return {
      left: `${Math.random() * 100}%`,
      top: `${8 + Math.random() * 76}%`,
      width: `${size}px`,
      height: `${size}px`,
      filter: `blur(${blur.toFixed(2)}px)`,
      animationDelay: `${(-1 * Math.random() * 26).toFixed(2)}s`,
      animationDuration: `${18 + Math.random() * 18}s`,
      '--snow-opacity': `${(0.28 + Math.random() * 0.4).toFixed(2)}`,
      '--snow-mid-x': `${(-18 + Math.random() * 36).toFixed(1)}px`,
      '--snow-mid-y': `${(10 + Math.random() * 18).toFixed(1)}px`,
      '--snow-end-x': `${(-28 + Math.random() * 56).toFixed(1)}px`,
      '--snow-end-y': `${(28 + Math.random() * 34).toFixed(1)}px`,
      '--snow-scale-start': `${(0.74 + Math.random() * 0.18).toFixed(2)}`,
      '--snow-scale-peak': `${(0.96 + Math.random() * 0.22).toFixed(2)}`,
      '--snow-scale-end': `${(0.82 + Math.random() * 0.16).toFixed(2)}`,
    };
  });

export const createSnowPaletteHills = (): CSSProperties[] => [
  {
    left: '-8%',
    width: '33%',
    height: '58px',
    animationDelay: '0s',
    animationDuration: '24s',
  },
  {
    left: '15%',
    width: '29%',
    height: '44px',
    animationDelay: '0.24s',
    animationDuration: '21s',
  },
  {
    left: '35%',
    width: '36%',
    height: '68px',
    animationDelay: '0.08s',
    animationDuration: '26s',
  },
  {
    left: '60%',
    width: '26%',
    height: '48px',
    animationDelay: '0.32s',
    animationDuration: '23s',
  },
  {
    right: '-7%',
    width: '30%',
    height: '56px',
    animationDelay: '0.14s',
    animationDuration: '25s',
  },
];
