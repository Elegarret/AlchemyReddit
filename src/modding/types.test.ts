import { describe, expect, it } from 'vitest';
import { modElementSchema } from './types';

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
