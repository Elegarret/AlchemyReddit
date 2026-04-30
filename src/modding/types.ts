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
export const MAX_REACTION_SCRIPT_LENGTH = 4096;
export const MAX_MOD_ELEMENTS = 1024;
export const MAX_MOD_REACTIONS = 4096;
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
export const MOD_ELEMENT_ICON_SOURCE_VALUES = [
  'emoji',
  'image',
  'none',
] as const;
export const modElementIconSourceSchema = z.enum(
  MOD_ELEMENT_ICON_SOURCE_VALUES
);
export type ModElementIconSource = z.infer<typeof modElementIconSourceSchema>;
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
    iconSource: modElementIconSourceSchema.optional(),
    emoji: z.string().min(1).max(16).optional(),
    imageUrl: z.string().url().max(4096).optional(),
    bgColorToken: z.string().min(1).max(32).optional(),
    frameColorToken: z.string().min(1).max(32).optional(),
    colorToken: z.string().min(1).max(32).optional(),
    message: z.string().max(MAX_ELEMENT_MESSAGE_LENGTH).optional(),
    effect: modElementEffectSchema.optional(),
    nonConsumable: z.boolean().optional(),
  })
  .superRefine((element, ctx) => {
    const iconSource = element.iconSource ?? 'emoji';

    if (iconSource === 'emoji') {
      if (!element.emoji) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Emoji icons require an emoji value.',
          path: ['emoji'],
        });
      }

      if (element.imageUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Emoji icons cannot include an image URL.',
          path: ['imageUrl'],
        });
      }

      return;
    }

    if (iconSource === 'image') {
      if (!element.imageUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Image icons require an image URL.',
          path: ['imageUrl'],
        });
      }

      if (element.emoji) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Image icons cannot include an emoji value.',
          path: ['emoji'],
        });
      }

      return;
    }

    if (element.emoji && element.imageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No-icon elements may preserve at most one previous icon.',
        path: ['imageUrl'],
      });
    }
  })
  .transform((element) => ({
    normalizedLegacyEffect:
      LEGACY_ELEMENT_EFFECTS[element.id] ??
      LEGACY_ELEMENT_EFFECTS[
        element.name.trim().toLowerCase().replace(/\s+/g, '-')
      ],
    id: element.id,
    name: element.name,
    iconSource: element.iconSource ?? 'emoji',
    ...(element.emoji ? { emoji: element.emoji } : {}),
    ...(element.imageUrl ? { imageUrl: element.imageUrl.trim() } : {}),
    bgColorToken:
      element.bgColorToken ?? element.colorToken ?? DEFAULT_MOD_BG_COLOR_TOKEN,
    frameColorToken:
      element.frameColorToken ??
      element.colorToken ??
      DEFAULT_MOD_FRAME_COLOR_TOKEN,
    message: element.message?.trim() ?? '',
    effect: element.effect,
    nonConsumable: element.nonConsumable ?? false,
  }))
  .transform(({ normalizedLegacyEffect, ...element }) => ({
    ...element,
    effect: element.effect ?? normalizedLegacyEffect ?? 'none',
  }));

export type ModElement = z.infer<typeof modElementSchema>;

export const getModElementActiveIconValue = (
  element: Pick<ModElement, 'emoji' | 'iconSource' | 'imageUrl'>
) => {
  if (element.iconSource === 'emoji') {
    return element.emoji ?? null;
  }

  if (element.iconSource === 'image') {
    return element.imageUrl ?? null;
  }

  return null;
};

export const modReactionSchema = z.object({
  leftId: z.string().min(1).max(48),
  rightId: z.string().min(1).max(48),
  outputIds: z.array(z.string().min(1).max(48)).max(128),
  script: z.string().max(MAX_REACTION_SCRIPT_LENGTH).optional(),
});

export type ModReaction = z.infer<typeof modReactionSchema>;

export const modEventModeSchema = z.enum(['crossing', 'once', 'always']);
export type ModEventMode = z.infer<typeof modEventModeSchema>;

export const modEventSchema = z.object({
  mode: modEventModeSchema.optional().default('crossing'),
  condition: z.string().min(1).max(MAX_REACTION_SCRIPT_LENGTH),
  script: z.string().min(1).max(MAX_REACTION_SCRIPT_LENGTH),
});

export type ModEvent = z.infer<typeof modEventSchema>;

const reactionCommentLineSchema = z.string().max(MAX_REACTION_SCRIPT_LENGTH);

export const reactionCommentBlockSchema = z.object({
  headerComment: reactionCommentLineSchema.optional(),
  leadingComments: z.array(reactionCommentLineSchema).optional().default([]),
});

export type ReactionCommentBlock = z.infer<typeof reactionCommentBlockSchema>;

export const reactionCommentsSchema = z.object({
  byReaction: z
    .array(reactionCommentBlockSchema)
    .max(512)
    .optional()
    .default([]),
  trailingComments: z.array(reactionCommentLineSchema).optional().default([]),
});

export type ReactionComments = z.infer<typeof reactionCommentsSchema>;

export const normalizeModCounterDefinition = (counter: {
  initial: number;
  max?: number | undefined;
  min?: number | undefined;
}) => {
  const min = counter.min;
  const max =
    counter.max !== undefined && min !== undefined
      ? Math.max(min, counter.max)
      : counter.max;
  let initial = counter.initial;

  if (min !== undefined) {
    initial = Math.max(initial, min);
  }

  if (max !== undefined) {
    initial = Math.min(initial, max);
  }

  return {
    ...(max !== undefined ? { max } : {}),
    ...(min !== undefined ? { min } : {}),
    initial,
  };
};

export const modCounterSchema = z
  .object({
    elementId: z.string().min(1).max(48),
    initial: z.number().int(),
    max: z.number().int().optional(),
    min: z.number().int().optional(),
  })
  .transform((counter) => {
    return {
      ...counter,
      ...normalizeModCounterDefinition(counter),
    };
  });

export type ModCounterDefinition = z.infer<typeof modCounterSchema>;

export const modStatusSchema = z.enum(['draft', 'published', 'hidden']);
export type ModStatus = z.infer<typeof modStatusSchema>;

export const modDocSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  summary: z.string().max(280),
  coverImageUrl: z.string().url().max(4096).optional(),
  intro: z
    .string()
    .max(MAX_REALM_INTRO_LENGTH)
    .optional()
    .transform((value) => value ?? ''),
  ownerUserId: z.string().min(1).max(64),
  ownerUsername: z.string().min(1).max(64),
  startingElementIds: z.array(z.string().min(1).max(48)).min(2).max(8),
  counters: z.array(modCounterSchema).max(128).optional().default([]),
  showPalette: z.boolean().optional().default(true),
  compactElements: z.boolean().optional().default(false),
  elements: z.array(modElementSchema).max(MAX_MOD_ELEMENTS),
  reactions: z.array(modReactionSchema).max(MAX_MOD_REACTIONS),
  events: z.array(modEventSchema).max(128).optional().default([]),
  reactionComments: reactionCommentsSchema.optional().default({
    byReaction: [],
    trailingComments: [],
  }),
  status: modStatusSchema,
  updatedAt: z.string().min(1).max(64),
  publishedAt: z.string().min(1).max(64).optional(),
  publishedHash: z.string().min(1).max(64).optional(),
  sharePostId: z.string().min(1).max(64).optional(),
  featuredAt: z.string().min(1).max(64).optional(),
  featuredBy: z.string().min(1).max(64).optional(),
});

type ParsedModDoc = z.infer<typeof modDocSchema>;
export type ModDoc = Omit<
  ParsedModDoc,
  'compactElements' | 'events' | 'reactionComments'
> & {
  compactElements?: boolean;
  events?: ModEvent[];
  reactionComments?: ReactionComments;
};

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
  hasDraftVersion: z.boolean().optional().default(false),
  hasPublishedVersion: z.boolean().optional().default(false),
  elementCount: z.number().int().nonnegative(),
  reactionCount: z.number().int().nonnegative(),
  featuredAt: z.string().min(1).max(64).optional(),
  featuredBy: z.string().min(1).max(64).optional(),
  bestScore: z.number().optional(),
  upvotes: z.number().int().optional(),
  playerCount: z.number().int().nonnegative().optional(),
  completionCount: z.number().int().nonnegative().optional(),
});

export type ModListItem = z.infer<typeof modListItemSchema>;

export const adminModListItemSchema = modListItemSchema.extend({
  draftOwnerUsername: z.string().min(1).max(64).optional(),
  draftUpdatedAt: z.string().min(1).max(64).optional(),
  latestVersionStatus: modStatusSchema.nullable().optional().default(null),
});

export type AdminModListItem = z.infer<typeof adminModListItemSchema>;

export const paginatedResultSchema = <T extends z.ZodTypeAny>(
  itemSchema: T
) =>
  z.object({
    items: z.array(itemSchema),
    page: z.number().int().nonnegative(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

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

export type ActiveCounterDefinition = {
  elementId: string;
  initial: number;
  max?: number | undefined;
  min?: number | undefined;
  name: string;
};

export type ActiveRuleset = {
  kind: 'base' | 'mod';
  rulesetId: string;
  title: string;
  summary: string;
  coverImageUrl?: string;
  intro: string;
  storageScope: string;
  startingElements: string[];
  startingCounterElementIds: string[];
  recipes: Record<string, string[]>;
  reactionScripts: Record<string, string>;
  events: ModEvent[];
  elementNames?: Record<string, string>;
  elementStyles: Record<string, string>;
  elementIcons: Record<string, ElementIconValue>;
  elementEffects: Record<string, ModElementEffect>;
  keyItems: string[];
  keyItemData: Record<string, KeyItemData>;
  elementMessages: Record<string, string>;
  nonConsumableElementIds: string[];
  counterDefinitions: ActiveCounterDefinition[];
  counterNames: string[];
  showPalette: boolean;
  compactElements: boolean;
  sourceModId?: string;
  publishedHash?: string;
  ownerUsername?: string;
  publishedAt?: string;
};

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  scriptErrors: string[];
  warnings: string[];
  reachableElementIds: string[];
  totalElements: number;
};

export const saveDraftInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(80),
  summary: z.string().max(MAX_REALM_SUMMARY_LENGTH),
  coverImageUrl: z.string().url().max(4096).optional(),
  intro: z
    .string()
    .max(MAX_REALM_INTRO_LENGTH)
    .optional()
    .transform((value) => value ?? ''),
  startingElementIds: z.array(z.string().min(1).max(48)).min(2).max(8),
  counters: z.array(modCounterSchema).max(128).optional().default([]),
  showPalette: z.boolean().optional().default(true),
  compactElements: z.boolean().optional().default(false),
  elements: z.array(modElementSchema).max(MAX_MOD_ELEMENTS),
  reactions: z.array(modReactionSchema).max(MAX_MOD_REACTIONS),
  events: z.array(modEventSchema).max(128).optional().default([]),
  reactionComments: reactionCommentsSchema.optional().default({
    byReaction: [],
    trailingComments: [],
  }),
});

type ParsedSaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type SaveDraftInput = Omit<
  ParsedSaveDraftInput,
  'compactElements' | 'events' | 'reactionComments'
> & {
  compactElements?: boolean;
  events?: ModEvent[];
  reactionComments?: ReactionComments;
};
