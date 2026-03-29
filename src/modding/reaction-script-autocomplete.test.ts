import { describe, expect, it } from 'vitest';
import {
  applyReactionScriptAutocompleteSuggestion,
  getReactionScriptAutocomplete,
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
