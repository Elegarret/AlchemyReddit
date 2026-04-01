import { describe, expect, it } from 'vitest';
import {
  buildRulesetFromDraft,
  DEFAULT_MOD_TITLE,
  getAutoRemovedReactionElementIds,
  resolveReactionForRuleset,
  validateModDraft,
} from './runtime';
import type { ModElement } from './types';

const makeElement = (id: string, name: string): ModElement => ({
  id,
  name,
  emoji: name[0] ?? '?',
  bgColorToken: 'ice',
  frameColorToken: 'ocean',
  message: '',
  effect: 'none',
  nonConsumable: false,
});

describe('validateModDraft', () => {
  it('requires a custom title and description', () => {
    const result = validateModDraft({
      title: DEFAULT_MOD_TITLE,
      summary: '',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [makeElement('air', 'Air'), makeElement('fire', 'Fire')],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    expect(result.errors).toContain(
      'Choose a custom realm title before publishing.'
    );
    expect(result.errors).toContain('A realm description is required.');
  });

  it('treats missing reactions as a blocking validation error', () => {
    const result = validateModDraft({
      title: 'Reactionless Realm',
      summary: 'This realm intentionally has no reactions.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [makeElement('air', 'Air'), makeElement('fire', 'Fire')],
      reactions: [],
    });

    expect(result.errors).toContain(
      'Add at least one reaction to make the realm playable.'
    );
  });

  it('reports unreachable elements by name instead of stale generated ids', () => {
    const result = validateModDraft({
      title: 'Crystal Realm',
      summary: 'A polished test realm.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('element-1', 'Crystal'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    expect(result.errors).toContain('Unreachable elements: Crystal');
    expect(result.errors.join(' ')).not.toContain('element-1');
  });

  it('rejects element names with reserved syntax characters', () => {
    const result = validateModDraft({
      title: 'Broken Syntax Realm',
      summary: 'This realm tries to use parser delimiters inside names.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [makeElement('air', 'Air'), makeElement('fire', 'Fi=re')],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    expect(result.errors).toContain(
      'Element Fi=re contains reserved syntax characters in its name.'
    );
  });

  it('rejects element names that start with reserved scripting keywords', () => {
    const result = validateModDraft({
      title: 'Keyword Realm',
      summary: 'This realm tries to use script keywords inside element names.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [makeElement('air', 'Air'), makeElement('fire', 'add stone')],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    expect(result.errors).toContain(
      'Element add stone starts with reserved scripting keyword "add".'
    );
  });

  it('includes intro, messages, and effects in the built ruleset', () => {
    const result = buildRulesetFromDraft({
      title: 'Signal Realm',
      summary: 'A realm with custom element metadata.',
      intro: 'Read this before your first reaction.',
      startingElementIds: ['air', 'light'],
      counters: [
        {
          elementId: 'light',
          initial: 12,
          max: 20,
          min: 5,
        },
      ],
      showPalette: false,
      elements: [
        makeElement('air', 'Air'),
        {
          ...makeElement('light', 'Lantern'),
          message: 'This element glows with intent.',
          effect: 'light',
          nonConsumable: true,
        },
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'light',
          outputIds: ['light'],
        },
      ],
    });

    expect(result.intro).toBe('Read this before your first reaction.');
    expect(result.elementMessages.light).toBe('This element glows with intent.');
    expect(result.elementEffects.light).toBe('light');
    expect(result.nonConsumableElementIds).toEqual(['light']);
    expect(result.counterDefinitions).toEqual([
      {
        elementId: 'light',
        initial: 12,
        max: 20,
        min: 5,
        name: 'Lantern',
      },
    ]);
    expect(result.counterNames).toEqual(['Lantern']);
    expect(result.showPalette).toBe(false);
  });

  it('keeps plain reactions working without scripts', () => {
    const ruleset = buildRulesetFromDraft({
      title: 'Steam Realm',
      summary: 'Plain reactions still resolve through the runtime helper.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('steam', 'Steam'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['steam'],
        },
      ],
    });

    const resolved = resolveReactionForRuleset({
      counterValues: {},
      currentTableElements: [
        { elementId: 'air', id: 'table-1' },
        { elementId: 'fire', id: 'table-2' },
      ],
      discoveredElementIds: ['air', 'fire'],
      leftId: 'air',
      rightId: 'fire',
      ruleset,
    });

    expect(resolved?.ok).toBe(true);
    if (!resolved || !resolved.ok) {
      return;
    }

    expect(resolved.result).toEqual({
      counterValues: {},
      emittedElementIds: ['steam'],
      messages: [],
      popupEvents: [],
      removedTableElementIds: [],
      stopped: false,
      usedScript: false,
    });
  });

  it('keeps authored non-consumable reaction inputs on the table by default', () => {
    const ruleset = buildRulesetFromDraft({
      title: 'Persistent Realm',
      summary: 'Some ingredients stay on the table after reactions.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [
        {
          ...makeElement('air', 'Air'),
          nonConsumable: true,
        },
        makeElement('fire', 'Fire'),
        makeElement('steam', 'Steam'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['steam'],
        },
      ],
    });

    expect(
      getAutoRemovedReactionElementIds({
        draggedTableElementId: 'table-1',
        leftId: 'air',
        rightId: 'fire',
        ruleset,
        targetTableElementId: 'table-2',
      })
    ).toEqual(['table-2']);
  });

  it('suppresses plain non-consumable outputs that already survive on the table', () => {
    const ruleset = buildRulesetFromDraft({
      title: 'Single Copy Realm',
      summary: 'Non-consumables should not duplicate on the table.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [
        {
          ...makeElement('air', 'Air'),
          nonConsumable: true,
        },
        makeElement('fire', 'Fire'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
        },
      ],
    });

    const resolved = resolveReactionForRuleset({
      counterValues: {},
      currentTableElements: [
        { elementId: 'air', id: 'table-1' },
        { elementId: 'fire', id: 'table-2' },
      ],
      discoveredElementIds: ['air', 'fire'],
      leftId: 'air',
      rightId: 'fire',
      ruleset,
    });

    expect(resolved?.ok).toBe(true);
    if (!resolved || !resolved.ok) {
      return;
    }

    expect(resolved.result.emittedElementIds).toEqual([]);
  });

  it('still allows scripts to explicitly remove authored non-consumable elements', () => {
    const execution = resolveReactionForRuleset({
      counterValues: {},
      currentTableElements: [
        { elementId: 'air', id: 'table-1' },
        { elementId: 'fire', id: 'table-2' },
      ],
      discoveredElementIds: ['air', 'fire'],
      leftId: 'air',
      rightId: 'fire',
      ruleset: buildRulesetFromDraft({
        title: 'Delete Realm',
        summary: 'Scripts can still delete non-consumable elements.',
        intro: '',
        startingElementIds: ['air', 'fire'],
        counters: [],
        showPalette: true,
        elements: [
          {
            ...makeElement('air', 'Air'),
            nonConsumable: true,
          },
          makeElement('fire', 'Fire'),
          makeElement('steam', 'Steam'),
        ],
        reactions: [
          {
            leftId: 'air',
            rightId: 'fire',
            outputIds: ['steam'],
            script: 'remove Air\nadd Steam',
          },
        ],
      }),
    });

    expect(execution?.ok).toBe(true);
    if (!execution || !execution.ok) {
      return;
    }

    expect(execution.result.removedTableElementIds).toEqual(['table-1']);
  });

  it('dedupes repeated scripted non-consumable outputs when none are present yet', () => {
    const execution = resolveReactionForRuleset({
      counterValues: {},
      currentTableElements: [
        { elementId: 'air', id: 'table-1' },
        { elementId: 'fire', id: 'table-2' },
      ],
      discoveredElementIds: ['air', 'fire'],
      leftId: 'air',
      rightId: 'fire',
      ruleset: buildRulesetFromDraft({
        title: 'Repeated Reward Realm',
        summary: 'Duplicate scripted non-consumables should collapse to one.',
        intro: '',
        startingElementIds: ['air', 'fire'],
        counters: [],
        showPalette: true,
        elements: [
          makeElement('air', 'Air'),
          makeElement('fire', 'Fire'),
          {
            ...makeElement('light', 'Light'),
            nonConsumable: true,
          },
        ],
        reactions: [
          {
            leftId: 'air',
            rightId: 'fire',
            outputIds: [],
            script: 'add Light, Light',
          },
        ],
      }),
    });

    expect(execution?.ok).toBe(true);
    if (!execution || !execution.ok) {
      return;
    }

    expect(execution.result.emittedElementIds).toEqual(['light']);
  });

  it('allows one scripted replacement copy after explicitly removing an existing non-consumable', () => {
    const execution = resolveReactionForRuleset({
      counterValues: {},
      currentTableElements: [
        { elementId: 'air', id: 'table-1' },
        { elementId: 'fire', id: 'table-2' },
        { elementId: 'light', id: 'table-3' },
      ],
      discoveredElementIds: ['air', 'fire', 'light'],
      leftId: 'air',
      rightId: 'fire',
      ruleset: buildRulesetFromDraft({
        title: 'Replacement Realm',
        summary: 'Scripts can replace a non-consumable after removing it.',
        intro: '',
        startingElementIds: ['air', 'fire'],
        counters: [],
        showPalette: true,
        elements: [
          makeElement('air', 'Air'),
          makeElement('fire', 'Fire'),
          {
            ...makeElement('light', 'Light'),
            nonConsumable: true,
          },
        ],
        reactions: [
          {
            leftId: 'air',
            rightId: 'fire',
            outputIds: [],
            script: 'remove Light\nadd Light, Light',
          },
        ],
      }),
    });

    expect(execution?.ok).toBe(true);
    if (!execution || !execution.ok) {
      return;
    }

    expect(execution.result.removedTableElementIds).toEqual(['table-3']);
    expect(execution.result.emittedElementIds).toEqual(['light']);
  });

  it('returns scripted popup events through the runtime helper', () => {
    const ruleset = buildRulesetFromDraft({
      title: 'Quest Realm',
      summary: 'Scripted reactions can drive popup UI.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('steam', 'Steam'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['steam'],
          script: 'popup "A hidden path opens.", Steam\nwin "You restored the realm.", Steam',
        },
      ],
    });

    const resolved = resolveReactionForRuleset({
      counterValues: {},
      currentTableElements: [
        { elementId: 'air', id: 'table-1' },
        { elementId: 'fire', id: 'table-2' },
      ],
      discoveredElementIds: ['air', 'fire'],
      leftId: 'air',
      rightId: 'fire',
      ruleset,
    });

    expect(resolved?.ok).toBe(true);
    if (!resolved || !resolved.ok) {
      return;
    }

    expect(resolved.result.popupEvents).toEqual([
      {
        iconElementId: 'steam',
        kind: 'popup',
        text: 'A hidden path opens.',
      },
      {
        iconElementId: 'steam',
        kind: 'win',
        text: 'You restored the realm.',
      },
    ]);
    expect(resolved.result.stopped).toBe(true);
  });

  it('reports invalid scripted reactions during draft validation', () => {
    const result = validateModDraft({
      title: 'Broken Script Realm',
      summary: 'Script validation should be line-aware.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('steam', 'Steam'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['steam'],
          script: 'if (count(money) >= 1) add air',
        },
      ],
    });

    expect(result.errors).not.toContain(
      '"Air + Fire" script line 1: Unknown counter "money".'
    );
    expect(result.errors).not.toContain('Unreachable elements: Steam');
    expect(result.scriptErrors).toContain(
      '"Air + Fire" script line 1: Unknown counter "money".'
    );
    expect(result.isValid).toBe(false);
  });

  it('rejects counters as starters, reactions, and normal script elements', () => {
    const result = validateModDraft({
      title: 'Counter Realm',
      summary: 'Counters stay out of normal gameplay flows.',
      intro: '',
      startingElementIds: ['air', 'health'],
      counters: [
        {
          elementId: 'health',
          initial: 0,
          max: 10,
          min: 0,
        },
      ],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('health', 'Health'),
      ],
      reactions: [
        {
          leftId: 'health',
          rightId: 'fire',
          outputIds: ['air', 'health'],
          script: 'add Health',
        },
      ],
    });

    expect(result.errors).toContain(
      'Counter Health cannot also be a starting element.'
    );
    expect(result.errors).toContain(
      'Reaction Health + Fire cannot use counters as ingredients.'
    );
    expect(result.errors).toContain(
      'Reaction Health + Fire cannot output counter Health as a normal element.'
    );
    expect(result.scriptErrors).toContain(
      '"Health + Fire" script line 1: Counter "Health" cannot act as a normal element here. Use count(...) or set counterName += 1 instead.'
    );
  });

  it('allows counters as popup icons while still treating them as counters', () => {
    const result = validateModDraft({
      title: 'Popup Counter Realm',
      summary: 'Counter icons can still appear in popup UI.',
      intro: '',
      startingElementIds: ['air', 'fire'],
      counters: [
        {
          elementId: 'health',
          initial: 3,
          max: 10,
          min: 0,
        },
      ],
      showPalette: true,
      elements: [
        makeElement('air', 'Air'),
        makeElement('fire', 'Fire'),
        makeElement('health', 'Health'),
      ],
      reactions: [
        {
          leftId: 'air',
          rightId: 'fire',
          outputIds: ['air'],
          script: 'popup "Watch your health.", Health',
        },
      ],
    });

    expect(result.scriptErrors).toEqual([]);
  });
});
