import { describe, expect, it } from 'vitest';
import {
  applyReactionScriptAutocompleteSuggestion,
  getReactionScriptAutocomplete,
  getReactionTextAutocomplete,
} from './reaction-script-autocomplete';

const elementNames = ['Dust', 'Bandage', 'Key'];
const counterNames = ['health', 'money'];

describe('getReactionScriptAutocomplete', () => {
  it('suggests top-level keywords at the start of a line', () => {
    const result = getReactionScriptAutocomplete({
      counterNames,
      cursor: 0,
      elementNames,
      value: '',
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'if',
      'add',
      'remove',
      'remove_all',
      'set',
      'message',
      'popup',
      'win',
      'lose',
      'stop',
    ]);
  });

  it('suggests condition starters inside if (...)', () => {
    const value = 'if (no';
    const result = getReactionScriptAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'not_on_table',
      'not_discovered',
    ]);
  });

  it('suggests and after a complete condition', () => {
    const value = 'if (count(health) < 10';
    const result = getReactionScriptAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'and',
    ]);
  });

  it('suggests element names after add', () => {
    const value = 'add Ba';
    const result = getReactionScriptAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Bandage',
    ]);
  });

  it('suggests element names after commas in add lists', () => {
    const value = 'add Dust, Ba';
    const result = getReactionScriptAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Bandage',
    ]);
  });

  it('suggests counters inside count(...) and set(...)', () => {
    const countValue = 'if (count(he';
    const countResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: countValue.length,
      elementNames,
      value: countValue,
    });
    const setValue = 'set(mo';
    const setResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: setValue.length,
      elementNames,
      value: setValue,
    });

    expect(countResult.suggestions.map((suggestion) => suggestion.label)).toEqual(
      ['health']
    );
    expect(setResult.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'money',
    ]);
  });

  it('suggests set operators after an exact counter name and stops on commas', () => {
    const operatorValue = 'set(money';
    const operatorResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: operatorValue.length,
      elementNames,
      value: operatorValue,
    });
    const commaValue = 'set(money, ';
    const commaResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: commaValue.length,
      elementNames,
      value: commaValue,
    });

    expect(operatorResult.suggestions.map((suggestion) => suggestion.label)).toEqual(
      ['=', '+=', '-=']
    );
    expect(operatorResult.suggestions.map((suggestion) => suggestion.text)).toEqual([
      ' = ',
      ' += ',
      ' -= ',
    ]);
    expect(commaResult.suggestions).toEqual([]);
  });

  it('does not suggest counters in add, but still suggests them for popup icons', () => {
    const addValue = 'add He';
    const addResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: addValue.length,
      elementNames,
      iconElementNames: [...elementNames, 'Health'],
      value: addValue,
    });
    const popupValue = 'popup("Found a clue.", He';
    const popupResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: popupValue.length,
      elementNames,
      iconElementNames: [...elementNames, 'Health'],
      value: popupValue,
    });

    expect(addResult.suggestions).toEqual([]);
    expect(popupResult.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Health',
    ]);
  });

  it('suggests element names as optional popup icons', () => {
    const value = 'popup("Found a clue.", Ke';
    const result = getReactionScriptAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Key',
    ]);
  });

  it('stops suggesting after an exact token has been accepted', () => {
    const addValue = 'add Dust';
    const addResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: addValue.length,
      elementNames,
      value: addValue,
    });
    const keywordValue = 'stop';
    const keywordResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: keywordValue.length,
      elementNames,
      value: keywordValue,
    });

    expect(addResult.suggestions).toEqual([]);
    expect(keywordResult.suggestions).toEqual([]);
  });

  it('inserts canonical templates with the cursor inside brackets or quotes', () => {
    const messageResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: 3,
      elementNames,
      value: 'mes',
    });
    const ifResult = getReactionScriptAutocomplete({
      counterNames,
      cursor: 1,
      elementNames,
      value: 'i',
    });

    const messageSuggestion = messageResult.suggestions[0];
    const ifSuggestion = ifResult.suggestions[0];

    expect(messageSuggestion?.label).toBe('message');
    expect(ifSuggestion?.label).toBe('if');

    if (!messageSuggestion || !ifSuggestion) {
      return;
    }

    expect(
      applyReactionScriptAutocompleteSuggestion({
        suggestion: messageSuggestion,
        value: 'mes',
      })
    ).toEqual({
      cursor: 'message("'.length,
      value: 'message("")',
    });

    expect(
      applyReactionScriptAutocompleteSuggestion({
        suggestion: ifSuggestion,
        value: 'i',
      })
    ).toEqual({
      cursor: 'if ('.length,
      value: 'if () ',
    });
  });
});

describe('getReactionTextAutocomplete', () => {
  it('suggests top-level left and right reaction ingredients', () => {
    const leftValue = 'Du';
    const leftResult = getReactionTextAutocomplete({
      counterNames,
      cursor: leftValue.length,
      elementNames,
      value: leftValue,
    });
    const rightValue = 'Dust + Ba';
    const rightResult = getReactionTextAutocomplete({
      counterNames,
      cursor: rightValue.length,
      elementNames,
      value: rightValue,
    });

    expect(leftResult.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Dust',
    ]);
    expect(rightResult.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Bandage',
    ]);
  });

  it('suggests inline outputs and the script block option after =', () => {
    const value = 'Dust + Key = ';
    const result = getReactionTextAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      '</>script',
      'Bandage',
      'Dust',
      'Key',
    ]);
  });

  it('inserts a script block as a newline plus indent', () => {
    const value = 'Dust + Key =';
    const result = getReactionTextAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });
    const scriptSuggestion = result.suggestions.find(
      (suggestion) => suggestion.label === '</>script'
    );

    expect(scriptSuggestion).toBeDefined();
    if (!scriptSuggestion) {
      return;
    }

    expect(
      applyReactionScriptAutocompleteSuggestion({
        suggestion: scriptSuggestion,
        value,
      })
    ).toEqual({
      cursor: 'Dust + Key =\n    '.length,
      value: 'Dust + Key =\n    ',
    });
  });

  it('suggests inline reaction outputs after commas', () => {
    const value = 'Dust + Key = Dust, Ba';
    const result = getReactionTextAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Bandage',
    ]);
  });

  it('switches to standard script suggestions on indented lines', () => {
    const value = 'Dust + Key =\n    se';
    const result = getReactionTextAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'set',
    ]);
  });

  it('does not open autocomplete after a script block colon header', () => {
    const value = 'Dust + Key:';
    const result = getReactionTextAutocomplete({
      counterNames,
      cursor: value.length,
      elementNames,
      value,
    });

    expect(result.suggestions).toEqual([]);
  });
});
