import { describe, expect, it } from 'vitest';
import {
  modCounterSchema,
  modDocSchema,
  modElementSchema,
  saveDraftInputSchema,
} from './types';

describe('modElementSchema', () => {
  it('defaults legacy emoji elements to emoji icon mode', () => {
    const element = modElementSchema.parse({
      id: 'air',
      name: 'Air',
      emoji: 'A',
      bgColorToken: 'ice',
      frameColorToken: 'ocean',
    });

    expect(element.iconSource).toBe('emoji');
    expect(element.nonConsumable).toBe(false);
  });

  it('accepts uploaded image icons', () => {
    const element = modElementSchema.parse({
      id: 'air',
      name: 'Air',
      iconSource: 'image',
      imageUrl: 'https://i.redd.it/example.png',
      bgColorToken: 'ice',
      frameColorToken: 'ocean',
    });

    expect(element.iconSource).toBe('image');
    expect(element.imageUrl).toBe('https://i.redd.it/example.png');
  });

  it('accepts no-icon elements that preserve a previous emoji', () => {
    const element = modElementSchema.parse({
      id: 'air',
      name: 'Air',
      iconSource: 'none',
      emoji: 'A',
      bgColorToken: 'ice',
      frameColorToken: 'ocean',
    });

    expect(element.iconSource).toBe('none');
    expect(element.emoji).toBe('A');
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

describe('realm cover schemas', () => {
  it('defaults compact board elements off for drafts and published mods', () => {
    const draft = saveDraftInputSchema.parse({
      title: 'Compact Realm',
      summary: 'A realm with default board sizing.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [],
      reactions: [],
    });

    const mod = modDocSchema.parse({
      id: 'mod-1',
      title: 'Compact Realm',
      summary: 'A realm with default board sizing.',
      intro: '',
      ownerUserId: 't2_author',
      ownerUsername: 'author',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [],
      reactions: [],
      status: 'published',
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    expect(draft.compactElements).toBe(false);
    expect(mod.compactElements).toBe(false);
  });

  it('accepts optional realm cover image URLs on drafts and published mods', () => {
    const draft = saveDraftInputSchema.parse({
      title: 'Cover Realm',
      summary: 'A realm with a cover.',
      coverImageUrl: 'https://i.redd.it/realm-cover.png',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [],
      reactions: [],
    });

    const mod = modDocSchema.parse({
      id: 'mod-1',
      title: 'Cover Realm',
      summary: 'A realm with a cover.',
      coverImageUrl: 'https://i.redd.it/realm-cover.png',
      intro: '',
      ownerUserId: 't2_author',
      ownerUsername: 'author',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [],
      reactions: [],
      status: 'published',
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    expect(draft.coverImageUrl).toBe('https://i.redd.it/realm-cover.png');
    expect(mod.coverImageUrl).toBe('https://i.redd.it/realm-cover.png');
  });

  it('rejects invalid realm cover image URLs', () => {
    const parsed = saveDraftInputSchema.safeParse({
      title: 'Cover Realm',
      summary: 'A realm with a cover.',
      coverImageUrl: 'not-a-url',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [],
      reactions: [],
    });

    expect(parsed.success).toBe(false);
  });
});
