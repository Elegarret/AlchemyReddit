import { describe, expect, it } from 'vitest';
import { modCounterSchema, modElementSchema } from './types';

describe('modElementSchema', () => {
  it('defaults nonConsumable to false', () => {
    const element = modElementSchema.parse({
      id: 'air',
      name: 'Air',
      emoji: 'A',
      bgColorToken: 'ice',
      frameColorToken: 'ocean',
    });

    expect(element.nonConsumable).toBe(false);
  });
});

describe('modCounterSchema', () => {
  it('allows optional bounds and preserves an unbounded initial value', () => {
    const counter = modCounterSchema.parse({
      elementId: 'health',
      initial: 25,
    });

    expect(counter).toEqual({
      elementId: 'health',
      initial: 25,
    });
  });

  it('normalizes reversed bounds while clamping the initial value', () => {
    const counter = modCounterSchema.parse({
      elementId: 'health',
      initial: 50,
      max: 10,
      min: 20,
    });

    expect(counter).toEqual({
      elementId: 'health',
      initial: 20,
      max: 20,
      min: 20,
    });
  });
});
