import type { ReactionScriptEventState } from './modding/reaction-script';

export const PLAYER_PROGRESS_VERSION = 1;

export type SavedTableElement = {
  id: string;
  name: string;
  x: number;
  y: number;
  icon?: string;
  hint?: string;
};

export type PlayerProgressInput = {
  discovered: string[];
  tableElements: SavedTableElement[];
  counterValues: Record<string, number>;
  visibleCounterNames: string[];
  eventState: ReactionScriptEventState;
};

export type PlayerProgress = PlayerProgressInput & {
  updatedAt: string;
  version: typeof PLAYER_PROGRESS_VERSION;
};

export const createEmptyPlayerProgress = (): PlayerProgress => ({
  counterValues: {},
  discovered: [],
  eventState: {
    activeEventIds: [],
    firedEventIds: [],
  },
  tableElements: [],
  updatedAt: '',
  version: PLAYER_PROGRESS_VERSION,
  visibleCounterNames: [],
});
