import { describe, expect, it } from 'vitest';
import {
  applyReactionTextToDraft,
  createEmptyDraft,
  ensureElementInDraft,
} from './draft';

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

  it('sanitizes reserved syntax characters before creating new elements', () => {
    const resolved = ensureElementInDraft(createEmptyDraft(), 'Key(Shard)=');

    expect(
      resolved.draft.elements.find((element) => element.id === resolved.elementId)
    ).toMatchObject({
      name: 'KeyShard',
    });
  });

  it('strips leading scripting keywords before creating new elements', () => {
    const resolved = ensureElementInDraft(createEmptyDraft(), 'add stone');

    expect(
      resolved.draft.elements.find((element) => element.id === resolved.elementId)
    ).toMatchObject({
      name: 'stone',
    });
  });
});
