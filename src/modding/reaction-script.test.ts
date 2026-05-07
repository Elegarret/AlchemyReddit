import { describe, expect, it } from 'vitest';
import {
  executeReactionScript,
  formatReactionScript,
  getReactionScriptEventId,
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

const literal = (value: number) => ({
  kind: 'literal',
  value,
});

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
          value: literal(1),
        },
        conditions: [],
        line: 3,
      },
      {
        action: {
          counterName: 'money',
          kind: 'set',
          operator: '-=',
          value: literal(1),
        },
        conditions: [],
        line: 4,
      },
      {
        action: {
          counterName: 'health',
          kind: 'set',
          operator: '=',
          value: literal(10),
        },
        conditions: [],
        line: 5,
      },
      {
        action: { elementRefs: ['flashlight'], kind: 'remove' },
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

  it('parses compact counter decrement syntax without folding the operator into the name', () => {
    const parsed = parseReactionScript('set money-=1');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements[0]?.action).toEqual({
      counterName: 'money',
      kind: 'set',
      operator: '-=',
      value: literal(1),
    });
  });

  it('parses calls, counter expressions, random expressions, and multi-remove', () => {
    const parsed = parseReactionScript(
      [
        'call Heal',
        'set Score += Luck',
        'set Luck += random(-5,5)',
        'if (random(100) < 33) remove dust, key',
      ].join('\n')
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements.map((statement) => statement.action)).toEqual([
      { functionName: 'Heal', kind: 'call' },
      {
        counterName: 'Score',
        kind: 'set',
        operator: '+=',
        value: { counterName: 'Luck', kind: 'counter' },
      },
      {
        counterName: 'Luck',
        kind: 'set',
        operator: '+=',
        value: { kind: 'random', max: 5, min: -5 },
      },
      { elementRefs: ['dust', 'key'], kind: 'remove' },
    ]);
    expect(parsed.ast.statements[3]?.conditions).toEqual([
      {
        kind: 'value_compare',
        left: { kind: 'random', max: 99, min: 0 },
        operator: '<',
        right: literal(33),
      },
    ]);
    expect(formatReactionScript(parsed.ast)).toBe(
      [
        'call Heal',
        'set Score += Luck',
        'set Luck += random(-5, 5)',
        'if (random(100) < 33) remove dust, key',
      ].join('\n')
    );
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
    const spaced = parseReactionScript('if ( count(health) < 10 ) add bandage');

    expect(compact.ok).toBe(true);
    expect(spaced.ok).toBe(true);
    if (!compact.ok || !spaced.ok) {
      return;
    }

    expect(compact.ast).toEqual(spaced.ast);
  });

  it('parses semicolon action groups on if lines', () => {
    const parsed = parseReactionScript(
      'if (count(Noise) >= 3) add key; set Noise += 1; stop'
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements).toEqual([
      {
        action: { elementRefs: ['key'], kind: 'add' },
        conditionGroupId: 1,
        conditions: [
          {
            counterName: 'Noise',
            kind: 'count_compare',
            operator: '>=',
            value: 3,
          },
        ],
        line: 1,
      },
      {
        action: {
          counterName: 'Noise',
          kind: 'set',
          operator: '+=',
          value: literal(1),
        },
        conditionGroupId: 1,
        conditions: [
          {
            counterName: 'Noise',
            kind: 'count_compare',
            operator: '>=',
            value: 3,
          },
        ],
        line: 1,
      },
      {
        action: { kind: 'stop' },
        conditionGroupId: 1,
        conditions: [
          {
            counterName: 'Noise',
            kind: 'count_compare',
            operator: '>=',
            value: 3,
          },
        ],
        line: 1,
      },
    ]);
  });

  it('parses indented if blocks with spaces and tabs', () => {
    const parsed = parseReactionScript(
      [
        'if (count(Noise) >= 3):',
        '    add key',
        '    set Noise += 1',
        'if (count(Noise) >= 4):',
        '\tadd bandage',
      ].join('\n')
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements.map((statement) => statement.action)).toEqual([
      { elementRefs: ['key'], kind: 'add' },
      {
        counterName: 'Noise',
        kind: 'set',
        operator: '+=',
        value: literal(1),
      },
      { elementRefs: ['bandage'], kind: 'add' },
    ]);
    expect(
      parsed.ast.statements.map((statement) => statement.conditionGroupId)
    ).toEqual([1, 1, 2]);
    expect(parsed.ast.statements.map((statement) => statement.line)).toEqual([
      2, 3, 5,
    ]);
  });

  it('keeps semicolons inside quoted text and before comments', () => {
    const script = [
      'if (count(Noise) >= 3): // loud enough',
      '    message "a; b" // text semicolon',
      '    add key',
    ].join('\n');
    const parsed = parseReactionScript(script);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.ast.statements.map((statement) => statement.action)).toEqual([
      { kind: 'message', text: 'a; b' },
      { elementRefs: ['key'], kind: 'add' },
    ]);
    expect(formatReactionScript(parsed.ast)).toBe(script);
  });

  it('rejects empty if blocks and malformed semicolon lists', () => {
    const emptyBlock = parseReactionScript('if (count(Noise) >= 3):');
    const trailingSemicolon = parseReactionScript(
      'if (count(Noise) >= 3) add key;'
    );

    expect(emptyBlock.ok).toBe(false);
    if (!emptyBlock.ok) {
      expect(emptyBlock.errors).toEqual([
        {
          line: 1,
          message: 'If blocks must include an indented body.',
        },
      ]);
    }

    expect(trailingSemicolon.ok).toBe(false);
    if (!trailingSemicolon.ok) {
      expect(trailingSemicolon.errors).toEqual([
        {
          line: 1,
          message: 'If action lists cannot contain empty actions.',
        },
      ]);
    }
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

  it('formats multi-action if lines as blocks', () => {
    const formatted = formatReactionScript(
      'if(count(Noise)>=3)add key; message "a; b"; stop // done'
    );

    expect(formatted).toBe(
      [
        'if (count(Noise) >= 3):',
        '    add key',
        '    message "a; b"',
        '    stop // done',
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
        line: 2,
        message:
          'Use set counterName = expression, set counterName += expression, or set counterName -= expression.',
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
    const validation = validateReactionScript(
      'popup "A hidden clue appears.", relic',
      {
        counterNames: [],
        elements: elementRefs,
      }
    );

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
    const validation = validateReactionScript(
      'popup "A hidden clue appears.", Health',
      {
        counterNames: ['health'],
        elements: [...elementRefs, { id: 'health', name: 'Health' }],
        nonGameplayElementIds: ['health'],
      }
    );

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

  it('validates called functions and includes their emitted elements', () => {
    const validation = validateReactionScript('call Reward', {
      counterNames: [],
      elements: elementRefs,
      functions: [
        {
          name: 'Reward',
          script: 'add Key',
        },
      ],
    });

    expect(validation.ok).toBe(true);
    expect(validation.emittedElementIds).toEqual(['key']);
  });

  it('rejects unknown and recursive function calls', () => {
    const missing = validateReactionScript('call Missing', {
      counterNames: [],
      elements: elementRefs,
      functions: [],
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors).toEqual([
      {
        line: 1,
        message: 'Unknown function "Missing".',
      },
    ]);

    const recursive = validateReactionScript('call Loop', {
      counterNames: [],
      elements: elementRefs,
      functions: [
        {
          name: 'Loop',
          script: 'call Loop',
        },
      ],
    });
    expect(recursive.ok).toBe(false);
    expect(recursive.errors).toEqual([
      {
        line: 1,
        message: 'Function "Loop" cannot call itself recursively.',
      },
    ]);
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

  it('executes functions, counter expressions, deterministic random ranges, and multi-remove', () => {
    const execution = executeReactionScript({
      counterNames: ['Health', 'Luck'],
      counters: {
        Health: 1,
        Luck: 3,
      },
      discoveredElementIds: [],
      elements: [...elementRefs, { id: 'health', name: 'Health' }],
      functions: [
        {
          name: 'Heal',
          script: 'set Health += 2\nmessage "Recovered."',
        },
      ],
      nonGameplayElementIds: ['health'],
      script: [
        'call heal',
        'set Health += Luck',
        'set Health += random(5,5)',
        'if (random(1) < 1) add key',
        'remove dust, dust, Health',
      ].join('\n'),
      tableElements: [
        { elementId: 'dust', id: 'table-1' },
        { elementId: 'dust', id: 'table-2' },
        { elementId: 'key', id: 'table-3' },
      ],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.counterValues).toEqual({
      Health: 11,
      Luck: 3,
    });
    expect(execution.result.emittedElementIds).toEqual(['key']);
    expect(execution.result.hiddenCounterNames).toEqual(['Health']);
    expect(execution.result.messages).toEqual(['Recovered.']);
    expect(execution.result.removedTableElementIds).toEqual([
      'table-1',
      'table-2',
    ]);
  });

  it('evaluates grouped if conditions once before running the group', () => {
    const execution = executeReactionScript({
      counterNames: ['Noise'],
      counters: {
        Noise: 3,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      script: [
        'if (count(Noise) >= 3):',
        '    add key',
        '    set Noise -= 10',
        '    add bandage',
      ].join('\n'),
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.counterValues).toEqual({
      Noise: -7,
    });
    expect(execution.result.emittedElementIds).toEqual(['key', 'bandage']);
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

  it('preserves non-consumable elements for bare remove_all', () => {
    const execution = executeReactionScript({
      counterNames: [],
      counters: {},
      discoveredElementIds: [],
      elements: elementRefs,
      nonConsumableElementIds: ['flashlight'],
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
      'table-2',
      'table-3',
    ]);
    expect(execution.result.hiddenCounterNames).toEqual([]);
    expect(execution.result.shownCounterNames).toEqual([]);
  });

  it('removes directly targeted non-consumables for remove_all element', () => {
    const execution = executeReactionScript({
      counterNames: [],
      counters: {},
      discoveredElementIds: [],
      elements: elementRefs,
      nonConsumableElementIds: ['flashlight'],
      script: 'remove_all Flashlight',
      tableElements: [
        { elementId: 'flashlight', id: 'table-1' },
        { elementId: 'flashlight', id: 'table-2' },
        { elementId: 'dust', id: 'table-3' },
      ],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.removedTableElementIds).toEqual([
      'table-1',
      'table-2',
    ]);
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
    const eventId = getReactionScriptEventId({
      condition: 'count(Health) <= 0',
      mode: 'crossing',
      script: 'message "You died"\nlose "You died."',
    });
    expect(execution.result.eventState).toEqual({
      activeEventIds: [eventId],
      firedEventIds: [eventId],
    });
  });

  it('runs counter expression events when any referenced counter changes', () => {
    const execution = executeReactionScript({
      counterNames: ['Health', 'MaxHealth'],
      counters: {
        Health: 5,
        MaxHealth: 5,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      events: [
        {
          condition: 'Health < MaxHealth',
          mode: 'crossing',
          script: 'message "Can heal."',
        },
      ],
      script: 'set MaxHealth += 1',
      tableElements: [],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.messages).toEqual(['Can heal.']);
    const eventId = getReactionScriptEventId({
      condition: 'Health < MaxHealth',
      mode: 'crossing',
      script: 'message "Can heal."',
    });
    expect(execution.result.eventState).toEqual({
      activeEventIds: [eventId],
      firedEventIds: [eventId],
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
    const onceEventId = getReactionScriptEventId({
      condition: 'count(Health) <= 0',
      mode: 'once',
      script: 'message "Once."',
    });
    const onceExecution = executeReactionScript({
      counterNames: ['Health'],
      counters: {
        Health: 0,
      },
      discoveredElementIds: [],
      elements: elementRefs,
      eventState: {
        activeEventIds: ['0'],
        firedEventIds: [onceEventId],
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

  it('runs always counter events after another event on the same counter has fired', () => {
    let counters: Record<string, number> = {
      Noise: 0,
    };
    let activeEventIds: string[] = [];
    let firedEventIds: string[] = [];
    const runReaction = () => {
      const execution = executeReactionScript({
        counterNames: ['Noise'],
        counters,
        discoveredElementIds: [],
        elements: elementRefs,
        eventState: {
          activeEventIds,
          firedEventIds,
        },
        events: [
          {
            condition: 'count(Noise) >= 1',
            mode: 'once',
            script: 'message "Noise starts."',
          },
          {
            condition: 'count(Noise) >= 3',
            mode: 'always',
            script: 'message "Noise is loud."',
          },
        ],
        script: 'set Noise += 1\nmessage "Base reaction."',
        tableElements: [],
      });

      expect(execution.ok).toBe(true);
      if (!execution.ok) {
        throw new Error('Reaction script execution failed.');
      }
      if (!execution.result.eventState) {
        throw new Error('Expected event state.');
      }

      counters = execution.result.counterValues;
      activeEventIds = execution.result.eventState.activeEventIds;
      firedEventIds = execution.result.eventState.firedEventIds;
      return execution.result.messages;
    };

    expect(runReaction()).toEqual(['Noise starts.', 'Base reaction.']);
    expect(counters.Noise).toBe(1);

    expect(runReaction()).toEqual(['Base reaction.']);
    expect(counters.Noise).toBe(2);

    expect(runReaction()).toEqual(['Noise is loud.', 'Base reaction.']);
    expect(counters.Noise).toBe(3);

    expect(runReaction()).toEqual(['Noise is loud.', 'Base reaction.']);
    expect(counters.Noise).toBe(4);
  });

  it('evaluates event count conditions against counters instead of table elements', () => {
    const execution = executeReactionScript({
      counterNames: ['Noise'],
      counters: {
        Noise: 0,
      },
      discoveredElementIds: [],
      elements: [
        ...elementRefs,
        {
          id: 'noise',
          name: 'Noise',
        },
      ],
      events: [
        {
          condition: 'count(Noise) >= 3',
          mode: 'always',
          script: 'message "Noise is loud."',
        },
      ],
      script: 'set Noise += 0\nmessage "Base reaction."',
      tableElements: [
        { elementId: 'noise', id: 'table-1' },
        { elementId: 'noise', id: 'table-2' },
        { elementId: 'noise', id: 'table-3' },
      ],
    });

    expect(execution.ok).toBe(true);
    if (!execution.ok) {
      return;
    }

    expect(execution.result.messages).toEqual(['Base reaction.']);
    expect(execution.result.eventState).toEqual({
      activeEventIds: [],
      firedEventIds: [],
    });
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
