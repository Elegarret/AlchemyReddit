import { getWebViewMode, requestExpandedMode } from '@devvit/web/client';

export const EDITOR_TARGET_MOD_ID_STORAGE_KEY = 'alchemy-editor-target-mod-id';

type EntryName = 'game' | 'mod-editor' | 'mod-catalog';

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

export const openEntry = (event: MouseEvent, entry: EntryName) => {
  if (getWebViewMode() === 'expanded') {
    window.location.assign(`/src/${entry}.html`);
    return;
  }

  requestExpandedMode(event, entry);
};
