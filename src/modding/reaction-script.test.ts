import { describe, expect, it } from 'vitest';
import {
  executeReactionScript,
  formatReactionScript,
  hasReactionScript,
  parseReactionScript,
  validateReactionScript,
} from './reaction-script';

const elementRefs = [
  { id: 'dust', name: 'Dust' },
  { id: 'flashlight', name: 'Flashlight' },
  { id: 'scratched-note', name: 'Scratched Note' },
  { id: 'jacket', name: 'Jacket' },
  { id: 'bandage', name: 'Bandage' },
  { id: 'key', name: 'Key' },
];

const parseOrThrow = (script: string) => {
  const parsed = parseReactionScript(script);
  if (!parsed.ok) {
    throw new Error(parsed.errors.map((error) => error.message).join(', '));
  }

  return parsed.ast;
};

describe('parseReactionScript', () => {
  it('parses canonical actions and bare add shorthand', () => {
    const parsed = parseReactionScript(
      [
        'dust',
        'add dust, key',
        'set money += 1',
        'set money -= 1',
        'set health = 10',
        'remove flashlight',
        'remove_all dust',
        'remove_all',
        'message "The cupboard is locked."',
        'popup "A hidden clue appears.", key',
        'win "You escaped."',
        'lose "The room collapses.", dust',
        'stop',
      ].join('\n')
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements).toEqual([
      {
        action: { elementRefs: ['dust'], kind: 'add' },
        conditions: [],
        line: 1,
      },
      {
        action: { elementRefs: ['dust', 'key'], kind: 'add' },
        conditions: [],
        line: 2,
      },
      {
        action: {
          counterName: 'money',
          kind: 'set',
          operator: '+=',
          value: 1,
        },
        conditions: [],
        line: 3,
      },
      {
        action: {
          counterName: 'money',
          kind: 'set',
          operator: '-=',
          value: 1,
        },
        conditions: [],
        line: 4,
      },
      {
        action: {
          counterName: 'health',
          kind: 'set',
          operator: '=',
          value: 10,
        },
        conditions: [],
        line: 5,
      },
      {
        action: { elementRef: 'flashlight', kind: 'remove' },
        conditions: [],
        line: 6,
      },
      {
        action: { elementRef: 'dust', kind: 'remove_all' },
        conditions: [],
        line: 7,
      },
      {
        action: { kind: 'remove_all' },
        conditions: [],
        line: 8,
      },
      {
        action: { kind: 'message', text: 'The cupboard is locked.' },
        conditions: [],
        line: 9,
      },
      {
        action: {
          iconElementRef: 'key',
          kind: 'popup',
          text: 'A hidden clue appears.',
        },
        conditions: [],
        line: 10,
      },
      {
        action: { kind: 'win', text: 'You escaped.' },
        conditions: [],
        line: 11,
      },
      {
        action: {
          iconElementRef: 'dust',
          kind: 'lose',
          text: 'The room collapses.',
        },
        conditions: [],
        line: 12,
      },
      {
        action: { kind: 'stop' },
        conditions: [],
        line: 13,
      },
    ]);
  });

  it('parses if lines with not_discovered and count conditions', () => {
    const parsed = parseReactionScript(
      'if (on_table(flashlight) and not_discovered(jacket) and count(health) < 10) add bandage'
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements[0]).toEqual({
      action: { elementRefs: ['bandage'], kind: 'add' },
      conditions: [
        { elementRef: 'flashlight', kind: 'on_table' },
        { elementRef: 'jacket', kind: 'not_discovered' },
        {
          counterName: 'health',
          kind: 'count_compare',
          operator: '<',
          value: 10,
        },
      ],
      line: 1,
    });
  });

  it('accepts whitespace-tolerant if syntax', () => {
    const compact = parseReactionScript('if(count(health)<10)add bandage');
    const spaced = parseReactionScript(
      'if ( count(health) < 10 ) add bandage'
    );

    expect(compact.ok).toBe(true);
    expect(spaced.ok).toBe(true);
    if (!compact.ok || !spaced.ok) {
      return;
    }

    expect(compact.ast).toEqual(spaced.ast);
  });

  it('ignores full-line and trailing comments while preserving them in formatted output', () => {
    const script = [
      '// boot note',
      'add dust // spawn dust',
      'message "Use // literally."',
    ].join('\n');

    const parsed = parseReactionScript(script);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements).toEqual([
      {
        action: { elementRefs: ['dust'], kind: 'add' },
        conditions: [],
        line: 2,
      },
      {
        action: { kind: 'message', text: 'Use // literally.' },
        conditions: [],
        line: 3,
      },
    ]);
    expect(formatReactionScript(parsed.ast)).toBe(script);
  });

  it('formats valid scripts into canonical output', () => {
    const formatted = formatReactionScript(
      [
        'dust',
        'emit scratched-note, bandage',
        'if(count(health)<10)bandage',
        'if (on_table(flashlight) and undiscovered(jacket)) jacket',
        'remove_all',
        'message "Done."',
        'popup "A hidden clue appears.", key',
        'lose "The room collapses."',
      ].join('\n')
    );

    expect(formatted).toBe(
      [
        'add dust',
        'add scratched-note, bandage',
        'if (count(health) < 10) add bandage',
        'if (on_table(flashlight) and not_discovered(jacket)) add jacket',
        'remove_all',
        'message "Done."',
        'popup "A hidden clue appears.", key',
        'lose "The room collapses."',
      ].join('\n')
    );
  });

  it('reports line-aware parse failures for unsupported legacy counter syntax', () => {
    const parsed = parseReactionScript(
      [
        'if (health < 10) add bandage',
        'money += 1',
        'if (on_table(flashlight) or not_discovered(jacket)) add jacket',
        'popup mystery',
      ].join('\n')
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.errors).toEqual([
      {
        line: 1,
        message: 'Unsupported condition: health < 10',
      },
      {
        line: 2,
        message:
          'Use set counterName = number, set counterName += number, or set counterName -= number.',
      },
      {
        line: 3,
        message: 'Only "and" conditions are supported.',
      },
      {
        line: 4,
        message:
          'popup must contain a double-quoted string and an optional element name.',
      },
    ]);
  });

  it('keeps physical line numbers when comments are present', () => {
    const parsed = parseReactionScript(
      ['// comment', 'add dust', 'popup mystery'].join('\n')
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.errors).toEqual([
      {
        line: 3,
        message:
          'popup must contain a double-quoted string and an optional element name.',
      },
    ]);
  });
});

describe('validateReactionScript', () => {
  it('rejects unknown counters when none are configured', () => {
    const validation = validateReactionScript('set money += 1', {
      counterNames: [],
      elements: elementRefs,
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual([
      {
        line: 1,
        message: 'Unknown counter "money".',
      },
    ]);
  });

  it('collects added outputs from valid scripts', () => {
    const validation = validateReactionScript(
      'if (on_table(flashlight)) add scratched-note, bandage\njacket',
      {
        counterNames: [],
        elements: elementRefs,
      }
    );

    expect(validation.ok).toBe(true);
    expect(validation.emittedElementIds).toEqual([
      'scratched-note',
      'bandage',
      'jacket',
    ]);
  });

  it('rejects unknown popup icon element refs', () => {
    const validation = validateReactionScript('popup "A hidden clue appears.", relic', {
      counterNames: [],
      elements: elementRefs,
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual([
      {
        line: 1,
        message: 'Unknown element "relic".',
      },
    ]);
  });

  it('rejects counters when they are used as normal elements', () => {
    const validation = validateReactionScript('add health', {
      counterNames: ['health'],
      elements: [...elementRefs, { id: 'health', name: 'Health' }],
      nonGameplayElementIds: ['health'],
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual([
      {
        line: 1,
        message:
          'Counter "health" cannot act as a normal element here. Use count(...) or set counterName += 1 instead.',
      },
    ]);
  });

  it('still allows counters as popup icons', () => {
    const validation = validateReactionScript('popup "A hidden clue appears.", Health', {
      counterNames: ['health'],
      elements: [...elementRefs, { id: 'health', name: 'Health' }],
      nonGameplayElementIds: ['health'],
    });

    expect(validation.ok).toBe(true);
  });

  it('treats comment-only scripts as empty for override checks', () => {
    expect(hasReactionScript('// note only')).toBe(false);
    expect(hasReactionScript('// note only\nadd dust')).toBe(true);
  });
});

describe('executeReactionScript', () => {
  it('executes add, set, remove, remove_all, and message actions', () => {
    const execution = executeReactionScript({
      counterNames: ['health', 'money'],
      counters: {
        health: 4,
        money: 0,
      },
      discoveredElementIds: ['flashlight'],
      elements: elementRefs,
      script: [
        'set money += 1',
        'if (count(health) < 10) add bandage, key',
        'remove flashlight',
        'remove_all dust',
        'message "It is locked."',
      ].join('\n'),
      tableElements: [
        { elementId: 'flashlight', id: 'table-1' },
        { elementId: 'dust', id: 'table-2' },
        { elementId: 'dust', id: 'table-3' },
      ],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result).toEqual({
      counterValues: {
        health: 4,
        money: 1,
      },
      emittedElementIds: ['bandage', 'key'],
      messages: ['It is locked.'],
      popupEvents: [],
      removedTableElementIds: ['table-1', 'table-2', 'table-3'],
      stopped: false,
    });
  });

  it('queues popup events and stops on terminal win or lose actions', () => {
    const execution = executeReactionScript({
      counterNames: [],
      counters: {},
      discoveredElementIds: [],
      elements: elementRefs,
      script: parseOrThrow(
        [
          'popup "The room shifts.", dust',
          'popup "A key turns.", key',
          'win "You escaped.", jacket',
          'add bandage',
        ].join('\n')
      ),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.emittedElementIds).toEqual([]);
    expect(execution.result.popupEvents).toEqual([
      {
        iconElementId: 'dust',
        kind: 'popup',
        text: 'The room shifts.',
      },
      {
        iconElementId: 'key',
        kind: 'popup',
        text: 'A key turns.',
      },
      {
        iconElementId: 'jacket',
        kind: 'win',
        text: 'You escaped.',
      },
    ]);
    expect(execution.result.stopped).toBe(true);
  });

  it('stops execution after stop', () => {
    const execution = executeReactionScript({
      counterNames: [],
      counters: {},
      discoveredElementIds: [],
      elements: elementRefs,
      script: parseOrThrow(['add dust', 'stop', 'add jacket'].join('\n')),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.emittedElementIds).toEqual(['dust']);
    expect(execution.result.popupEvents).toEqual([]);
    expect(execution.result.stopped).toBe(true);
  });

  it('rejects add statements with empty list items', () => {
    const parsed = parseReactionScript('add dust, , key');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.errors).toEqual([
      {
        line: 1,
        message: 'add has an empty element name.',
      },
    ]);
  });

  it('clamps counter mutations to authored bounds', () => {
    const execution = executeReactionScript({
      counterNames: ['Health'],
      counterDefinitions: [
        {
          name: 'Health',
          min: 0,
          max: 10,
        },
      ],
      counters: {
        Health: 8,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      script: ['set health += 10', 'set Health -= 99'].join('\n'),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.counterValues).toEqual({
      Health: 0,
    });
  });

  it('supports optional one-sided counter bounds', () => {
    const execution = executeReactionScript({
      counterNames: ['Health'],
      counterDefinitions: [
        {
          name: 'Health',
          min: 0,
        },
      ],
      counters: {
        Health: 8,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      script: ['set health += 10', 'set Health -= 99'].join('\n'),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.counterValues).toEqual({
      Health: 0,
    });
  });

  it('leaves counters unbounded when no authored bounds exist', () => {
    const execution = executeReactionScript({
      counterNames: ['Health'],
      counterDefinitions: [
        {
          name: 'Health',
        },
      ],
      counters: {
        Health: 8,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      script: ['set health += 10', 'set Health -= 99'].join('\n'),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.counterValues).toEqual({
      Health: -81,
    });
  });

  it('clears the full table for bare remove_all', () => {
    const execution = executeReactionScript({
      counterNames: [],
      counters: {},
      discoveredElementIds: [],
      elements: elementRefs,
      script: 'remove_all',
      tableElements: [
        { elementId: 'flashlight', id: 'table-1' },
        { elementId: 'dust', id: 'table-2' },
        { elementId: 'key', id: 'table-3' },
      ],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.removedTableElementIds).toEqual([
      'table-1',
      'table-2',
      'table-3',
    ]);
  });
});
