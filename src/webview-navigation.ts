import { getWebViewMode, requestExpandedMode } from '@devvit/web/client';

export const EDITOR_TARGET_MOD_ID_STORAGE_KEY = 'alchemy-editor-target-mod-id';
export const LAST_PLAYED_REALM_STORAGE_KEY = 'alchemy-last-played-realm';

type EntryName = 'game' | 'mod-editor' | 'mod-catalog';
export type LastPlayedRealm = {
  modId: string;
  title: string;
};

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isLastPlayedRealm = (value: unknown): value is LastPlayedRealm => {
  if (!isUnknownRecord(value)) {
    return false;
  }

  return (
    typeof Reflect.get(value, 'modId') === 'string' &&
    typeof Reflect.get(value, 'title') === 'string'
  );
};

export const setEditorTargetModId = (modId: string | null) => {
  try {
    if (modId) {
      localStorage.setItem(EDITOR_TARGET_MOD_ID_STORAGE_KEY, modId);
      return;
    }

    localStorage.removeItem(EDITOR_TARGET_MOD_ID_STORAGE_KEY);
  } catch {
    // Ignore localStorage failures in constrained clients.
  }
};

export const getEditorTargetModId = () => {
  try {
    return localStorage.getItem(EDITOR_TARGET_MOD_ID_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setLastPlayedRealm = (realm: LastPlayedRealm | null) => {
  try {
    if (!realm) {
      localStorage.removeItem(LAST_PLAYED_REALM_STORAGE_KEY);
      return;
    }

    localStorage.setItem(LAST_PLAYED_REALM_STORAGE_KEY, JSON.stringify(realm));
  } catch {
    // Ignore localStorage failures in constrained clients.
  }
};

export const getLastPlayedRealm = () => {
  try {
    const raw = localStorage.getItem(LAST_PLAYED_REALM_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isLastPlayedRealm(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const openEntry = (event: MouseEvent, entry: EntryName) => {
  if (getWebViewMode() === 'expanded') {
    window.location.assign(`/src/${entry}.html`);
    return;
  }

  requestExpandedMode(event, entry);
};
