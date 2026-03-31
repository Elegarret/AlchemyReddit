import { type ModElement, type ModElementEffect, type SaveDraftInput } from '../modding/types';

export type EditorTab = 'mine' | 'editor';

export type ElementPanelView = 'extended' | 'compact';

export type ReactionWidgetProps = {
  counterElementIds: string[];
  counterNames: string[];
  index: number;
  reaction: SaveDraftInput['reactions'][number];
  elements: ModElement[];
  onCommit: (
    index: number,
    leftName: string,
    rightName: string,
    outputNames: string[]
  ) => void;
  onAddMissingElement: (name: string) => void;
  onMoveReaction: (fromIndex: number, toIndex: number) => void;
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
    value: 'explode',
    label: 'Explode',
    description: 'Triggers the existing explosion table effect.',
  },
  {
    value: 'hint',
    label: 'Hint',
    description: 'Shows the existing discovery hint bubble.',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Applies the existing glow effect on the table.',
  },
  {
    value: 'computer',
    label: 'Computer',
    description: 'Opens the reaction database popup on contact.',
  },
  {
    value: 'earthquake',
    label: 'Earthquake',
    description: 'Triggers the existing quake effect when created.',
  },
  {
    value: 'storm',
    label: 'Storm',
    description: 'Enables the existing ambient storm flashes.',
  },
];
