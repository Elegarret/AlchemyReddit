import { describe, expect, it } from 'vitest';
import { normalizeEditorElementEffect, ELEMENT_EFFECT_OPTIONS } from './constants';

describe('ELEMENT_EFFECT_OPTIONS', () => {
  it('only exposes the supported editor effects', () => {
    expect(ELEMENT_EFFECT_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'hint',
      'earthquake',
      'explode',
      'light',
    ]);
  });

  it('uses the updated effect labels', () => {
    expect(ELEMENT_EFFECT_OPTIONS.map((option) => option.label)).toEqual([
      'None',
      'Hint (show hint)',
      'Quake (shake screen)',
      'Explode (clear screen)',
      'Light',
    ]);
  });
});

describe('normalizeEditorElementEffect', () => {
  it('falls back to none for removed editor effects', () => {
    expect(normalizeEditorElementEffect('computer')).toBe('none');
    expect(normalizeEditorElementEffect('storm')).toBe('none');
  });

  it('preserves supported effects', () => {
    expect(normalizeEditorElementEffect('hint')).toBe('hint');
    expect(normalizeEditorElementEffect('earthquake')).toBe('earthquake');
  });
});
