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
        'stop-reaction',
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
      {
        action: { kind: 'stop_reaction' },
        conditions: [],
        line: 14,
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

  it('allows add and remove actions to target counters as visibility changes', () => {
    const validation = validateReactionScript('add health', {
      counterNames: ['health'],
      elements: [...elementRefs, { id: 'health', name: 'Health' }],
      nonGameplayElementIds: ['health'],
    });

    expect(validation.ok).toBe(true);
    expect(validation.emittedElementIds).toEqual([]);
  });

  it('rejects remove_all when targeting a counter', () => {
    const validation = validateReactionScript('remove_all Health', {
      counterNames: ['health'],
      elements: [...elementRefs, { id: 'health', name: 'Health' }],
      nonGameplayElementIds: ['health'],
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual([
      {
        line: 1,
        message:
          'Counter "Health" cannot be targeted by remove_all. Use remove counterName instead.',
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

  it('rejects stop-reaction outside event scripts', () => {
    const validation = validateReactionScript('stop-reaction', {
      counterNames: [],
      elements: elementRefs,
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual([
      {
        line: 1,
        message: 'stop-reaction can only be used inside event scripts.',
      },
    ]);

    expect(
      validateReactionScript('stop-reaction', {
        counterNames: [],
        elements: elementRefs,
        scriptKind: 'event',
      }).ok
    ).toBe(true);
  });
});

describe('executeReactionScript', () => {
  it('lets count(element) compare the amount of that element on the table', () => {
    const execution = executeReactionScript({
      counterNames: [],
      counters: {},
      discoveredElementIds: [],
      elements: elementRefs,
      script: 'if (count(Bandage) >= 2) add key',
      tableElements: [
        { elementId: 'bandage', id: 'table-1' },
        { elementId: 'bandage', id: 'table-2' },
        { elementId: 'dust', id: 'table-3' },
      ],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.emittedElementIds).toEqual(['key']);
  });

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
      hiddenCounterNames: [],
      messages: ['It is locked.'],
      popupEvents: [],
      removedTableElementIds: ['table-1', 'table-2', 'table-3'],
      shownCounterNames: [],
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
    expect(execution.result.hiddenCounterNames).toEqual([]);
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
    expect(execution.result.shownCounterNames).toEqual([]);
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
    expect(execution.result.hiddenCounterNames).toEqual([]);
    expect(execution.result.popupEvents).toEqual([]);
    expect(execution.result.shownCounterNames).toEqual([]);
    expect(execution.result.stopped).toBe(true);
  });

  it('tracks counter visibility separately from counter values', () => {
    const execution = executeReactionScript({
      counterNames: ['Health'],
      counters: {
        Health: 3,
      },
      discoveredElementIds: [],
      elements: [...elementRefs, { id: 'health', name: 'Health' }],
      nonGameplayElementIds: ['health'],
      script: ['add Health', 'set Health += 2', 'remove Health'].join('\n'),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.counterValues).toEqual({
      Health: 5,
    });
    expect(execution.result.emittedElementIds).toEqual([]);
    expect(execution.result.hiddenCounterNames).toEqual(['Health']);
    expect(execution.result.shownCounterNames).toEqual([]);
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
    expect(execution.result.hiddenCounterNames).toEqual([]);
    expect(execution.result.shownCounterNames).toEqual([]);
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
    expect(execution.result.hiddenCounterNames).toEqual([]);
    expect(execution.result.shownCounterNames).toEqual([]);
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
    expect(execution.result.hiddenCounterNames).toEqual([]);
    expect(execution.result.shownCounterNames).toEqual([]);
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
    expect(execution.result.hiddenCounterNames).toEqual([]);
    expect(execution.result.shownCounterNames).toEqual([]);
  });

  it('runs crossing events immediately after a matching counter change', () => {
    const execution = executeReactionScript({
      counterNames: ['Health'],
      counters: {
        Health: 1,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      events: [
        {
          condition: 'count(Health) <= 0',
          mode: 'crossing',
          script: 'message "You died"\nlose "You died."',
        },
      ],
      script: ['set Health -= 1', 'add bandage'].join('\n'),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.counterValues).toEqual({
      Health: 0,
    });
    expect(execution.result.messages).toEqual(['You died']);
    expect(execution.result.popupEvents).toEqual([
      {
        iconElementId: null,
        kind: 'lose',
        text: 'You died.',
      },
    ]);
    expect(execution.result.emittedElementIds).toEqual([]);
    expect(execution.result.eventState).toEqual({
      activeEventIds: ['0'],
      firedEventIds: ['0'],
    });
  });

  it('lets event scripts stop the outer reaction without a terminal popup', () => {
    const execution = executeReactionScript({
      counterNames: ['Health'],
      counters: {
        Health: 1,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      events: [
        {
          condition: 'count(Health) <= 0',
          mode: 'crossing',
          script: 'message "Too weak."\nstop-reaction',
        },
      ],
      script: ['set Health -= 1', 'add bandage'].join('\n'),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.messages).toEqual(['Too weak.']);
    expect(execution.result.emittedElementIds).toEqual([]);
    expect(execution.result.stopReaction).toBe(true);
    expect(execution.result.stopped).toBe(false);
  });

  it('supports once and always event repeat modes', () => {
    const onceExecution = executeReactionScript({
      counterNames: ['Health'],
      counters: {
        Health: 0,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      eventState: {
        activeEventIds: ['0'],
        firedEventIds: ['0'],
      },
      events: [
        {
          condition: 'count(Health) <= 0',
          mode: 'once',
          script: 'message "Once."',
        },
        {
          condition: 'count(Health) <= 0',
          mode: 'always',
          script: 'message "Always."',
        },
      ],
      script: 'set Health -= 1',
      tableElements: [],
    });

    expect(onceExecution.ok).toBe(true);
    if (!onceExecution.ok) {
      return;
    }

    expect(onceExecution.result.messages).toEqual(['Always.']);
  });

  it('reports recursive event loops instead of running forever', () => {
    const execution = executeReactionScript({
      counterNames: ['Heat'],
      counters: {
        Heat: 0,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      events: [
        {
          condition: 'count(Heat) >= 1',
          mode: 'always',
          script: 'set Heat += 1',
        },
      ],
      script: 'set Heat += 1',
      tableElements: [],
    });

    expect(execution.ok).toBe(false);
    if (execution.ok) {
      return;
    }

    expect(execution.errors).toEqual([
      {
        line: 1,
        message: 'Event loop limit exceeded.',
      },
    ]);
  });
});
