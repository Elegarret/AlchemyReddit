import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateModDraft } from '../modding/runtime';
import { saveDraftInputSchema } from '../modding/types';
import { parseImportedDraftText } from './draft';

const warriorsDraftPath = path.resolve(
  process.cwd(),
  'legacy_mods',
  'warriors-path',
  'draft.json'
);

describe('manual legacy mod ports', () => {
  it('imports the Warrior realm draft JSON through the editor import path', () => {
    const raw = fs.readFileSync(warriorsDraftPath, 'utf8');
    const imported = parseImportedDraftText(raw);

    expect(imported.title).toBe("Warrior's Path");
    expect(imported.showPalette).toBe(false);
    expect(imported.startingElementIds).toHaveLength(3);
    expect(imported.reactions.length).toBeGreaterThan(0);
    expect(saveDraftInputSchema.parse(imported)).toEqual(imported);
    expect(validateModDraft(imported)).toMatchObject({
      isValid: true,
      errors: [],
      scriptErrors: [],
    });
  });
});
