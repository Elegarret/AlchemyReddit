import { type ModElement, type ModElementEffect, type SaveDraftInput } from '../modding/types';

export type EditorTab = 'mine' | 'editor';

export type ElementPanelView = 'extended' | 'compact';

export type ReactionWidgetProps = {
  counterElementIds: string[];
  counterNames: string[];
  functions: SaveDraftInput['functions'];
  index: number;
  reaction: SaveDraftInput['reactions'][number];
  elements: ModElement[];
  scriptingHelpPageUrl: string | null;
  onCommit: (
    index: number,
    leftName: string,
    rightName: string,
    outputNames: string[]
  ) => void;
  onAddMissingElement: (name: string) => void;
  onPasteMissingElements: (names: string[]) => void;
  onMoveReaction: (fromIndex: number, toIndex: number) => void;
  onOpenScriptingHelp: () => void;
  onUpdateScript: (index: number, script: string) => void;
  onDelete: (index: number) => void;
  onNewReaction?: () => void;
};

export const ELEMENT_DATALIST_ID = 'alchemy-mod-elements';

export const DEFAULT_ELEMENT_NAME_PREFIX = 'Element';

export const ELEMENT_EFFECT_OPTIONS: Array<{
  value: ModElementEffect;
  label: string;
  description: string;
}> = [
  {
    value: 'none',
    label: 'None',
    description: 'No special runtime behavior.',
  },
  {
    value: 'hint',
    label: 'Hint (show hint)',
    description: 'Shows the existing discovery hint bubble.',
  },
  {
    value: 'earthquake',
    label: 'Quake (shake screen)',
    description: 'Shakes the screen when this element appears.',
  },
  {
    value: 'explode',
    label: 'Explode (clear screen)',
    description: 'Clears the current table with the existing explosion effect.',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Applies the existing glow effect on the table.',
  },
  {
    value: 'walking',
    label: 'Walking',
    description: 'Moves around the table inside the play area.',
  },
  {
    value: 'glitters',
    label: 'Glitters',
    description: 'Emits bright sparkles around itself while on the table.',
  },
];

const EDITOR_ELEMENT_EFFECT_VALUES = new Set(
  ELEMENT_EFFECT_OPTIONS.map((option) => option.value)
);

export const normalizeEditorElementEffect = (
  effect: ModElementEffect
): ModElementEffect =>
  EDITOR_ELEMENT_EFFECT_VALUES.has(effect) ? effect : 'none';
