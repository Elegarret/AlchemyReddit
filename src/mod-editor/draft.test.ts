import { describe, expect, it } from 'vitest';
import { applyReactionTextToDraft, createEmptyDraft } from './draft';

describe('applyReactionTextToDraft', () => {
  it('accepts script blocks introduced by a colon', () => {
    const draft = applyReactionTextToDraft(
      createEmptyDraft(),
      'Air+Fire:\n    add Dust\n'
    );

    expect(draft.reactions).toEqual([
      {
        leftId: 'air',
        rightId: 'fire',
        outputIds: [],
        script: 'add Dust',
      },
    ]);
  });
});
