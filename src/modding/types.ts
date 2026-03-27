import type { ComponentType } from 'react';
import { z } from 'zod';
import {
  DEFAULT_MOD_BG_COLOR_TOKEN,
  DEFAULT_MOD_FRAME_COLOR_TOKEN,
} from './colors';

export type ElementIconValue =
  | string
  | string[]
  | ComponentType<{ size?: number }>;

export const MAX_REALM_SUMMARY_LENGTH = 128;
export const MAX_REALM_INTRO_LENGTH = 512;
export const MAX_ELEMENT_MESSAGE_LENGTH = 512;
export const MOD_ELEMENT_EFFECT_VALUES = [
  'none',
  'explode',
  'hint',
  'light',
  'computer',
  'earthquake',
  'storm',
] as const;
export const modElementEffectSchema = z.enum(MOD_ELEMENT_EFFECT_VALUES);
export type ModElementEffect = z.infer<typeof modElementEffectSchema>;
export const LEGACY_ELEMENT_EFFECTS: Record<string, ModElementEffect> = {
  computer: 'computer',
  earthquake: 'earthquake',
  explode: 'explode',
  light: 'light',
  scientist: 'hint',
  storm: 'storm',
};

export const modElementSchema = z
  .object({
    id: z.string().min(1).max(48),
    name: z.string().min(1).max(32),
    emoji: z.string().min(1).max(16),
    bgColorToken: z.string().min(1).max(32).optional(),
    frameColorToken: z.string().min(1).max(32).optional(),
    colorToken: z.string().min(1).max(32).optional(),
    message: z.string().max(MAX_ELEMENT_MESSAGE_LENGTH).optional(),
    effect: modElementEffectSchema.optional(),
  })
  .transform((element) => ({
    normalizedLegacyEffect:
      LEGACY_ELEMENT_EFFECTS[element.id] ??
      LEGACY_ELEMENT_EFFECTS[element.name.trim().toLowerCase().replace(/\s+/g, '-')],
    id: element.id,
    name: element.name,
    emoji: element.emoji,
    bgColorToken:
      element.bgColorToken ?? element.colorToken ?? DEFAULT_MOD_BG_COLOR_TOKEN,
    frameColorToken:
      element.frameColorToken ??
      element.colorToken ??
      DEFAULT_MOD_FRAME_COLOR_TOKEN,
    message: element.message?.trim() ?? '',
    effect: element.effect,
  }))
  .transform(({ normalizedLegacyEffect, ...element }) => ({
    ...element,
    effect: element.effect ?? normalizedLegacyEffect ?? 'none',
  }));

export type ModElement = z.infer<typeof modElementSchema>;

export const modReactionSchema = z.object({
  leftId: z.string().min(1).max(48),
  rightId: z.string().min(1).max(48),
  outputIds: z.array(z.string().min(1).max(48)).min(1).max(4),
});

export type ModReaction = z.infer<typeof modReactionSchema>;

export const modStatusSchema = z.enum(['draft', 'published', 'hidden']);
export type ModStatus = z.infer<typeof modStatusSchema>;

export const modDocSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  summary: z.string().max(280),
  intro: z
    .string()
    .max(MAX_REALM_INTRO_LENGTH)
    .optional()
    .transform((value) => value ?? ''),
  ownerUserId: z.string().min(1).max(64),
  ownerUsername: z.string().min(1).max(64),
  startingElementIds: z.array(z.string().min(1).max(48)).min(2).max(8),
  elements: z.array(modElementSchema).max(128),
  reactions: z.array(modReactionSchema).max(512),
  status: modStatusSchema,
  updatedAt: z.string().min(1).max(64),
  publishedAt: z.string().min(1).max(64).optional(),
  publishedHash: z.string().min(1).max(64).optional(),
  sharePostId: z.string().min(1).max(64).optional(),
});

export type ModDoc = z.infer<typeof modDocSchema>;

export const modListItemSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  summary: z.string().max(280),
  ownerUsername: z.string().min(1).max(64),
  updatedAt: z.string().min(1).max(64),
  publishedAt: z.string().min(1).max(64).optional(),
  publishedHash: z.string().min(1).max(64).optional(),
  sharePostId: z.string().min(1).max(64).optional(),
  status: modStatusSchema,
  elementCount: z.number().int().nonnegative(),
  reactionCount: z.number().int().nonnegative(),
  upvotes: z.number().int().optional(),
  playerCount: z.number().int().nonnegative().optional(),
});

export type ModListItem = z.infer<typeof modListItemSchema>;

export const sharePostDataSchema = z.object({
  modId: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  slug: z.string().min(1).max(96),
  publishedHash: z.string().min(1).max(64).optional(),
});

export type SharePostData = z.infer<typeof sharePostDataSchema>;

export type KeyItemData = {
  description: string;
  motivation: string;
};

export type ActiveRuleset = {
  kind: 'base' | 'mod';
  rulesetId: string;
  title: string;
  summary: string;
  intro: string;
  storageScope: string;
  startingElements: string[];
  recipes: Record<string, string[]>;
  elementNames?: Record<string, string>;
  elementStyles: Record<string, string>;
  elementIcons: Record<string, ElementIconValue>;
  elementEffects: Record<string, ModElementEffect>;
  keyItems: string[];
  keyItemData: Record<string, KeyItemData>;
  elementMessages: Record<string, string>;
  sourceModId?: string;
  publishedHash?: string;
  ownerUsername?: string;
  publishedAt?: string;
};

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  reachableElementIds: string[];
  totalElements: number;
};

export const saveDraftInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(80),
  summary: z.string().max(MAX_REALM_SUMMARY_LENGTH),
  intro: z
    .string()
    .max(MAX_REALM_INTRO_LENGTH)
    .optional()
    .transform((value) => value ?? ''),
  startingElementIds: z.array(z.string().min(1).max(48)).min(2).max(8),
  elements: z.array(modElementSchema).max(128),
  reactions: z.array(modReactionSchema).max(512),
});

export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
