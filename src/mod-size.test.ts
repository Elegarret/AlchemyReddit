import { describe, expect, it } from 'vitest';
import {
  getRealmSizeLabel,
  getRealmSizeTooltip,
  isEmptyRealmSizeLabel,
} from './mod-size';

describe('mod size tiers', () => {
  it('maps reaction counts to the updated labels', () => {
    expect(getRealmSizeLabel(0)).toBe('empty');
    expect(getRealmSizeLabel(5)).toBe('empty');
    expect(getRealmSizeLabel(6)).toBe('tiny');
    expect(getRealmSizeLabel(10)).toBe('tiny');
    expect(getRealmSizeLabel(11)).toBe('small');
    expect(getRealmSizeLabel(30)).toBe('small');
    expect(getRealmSizeLabel(31)).toBe('mid');
    expect(getRealmSizeLabel(50)).toBe('mid');
    expect(getRealmSizeLabel(51)).toBe('big');
    expect(getRealmSizeLabel(100)).toBe('big');
    expect(getRealmSizeLabel(101)).toBe('huge');
    expect(getRealmSizeLabel(200)).toBe('huge');
    expect(getRealmSizeLabel(201)).toBe('mega');
  });

  it('flags the empty label and formats the tooltip', () => {
    expect(isEmptyRealmSizeLabel('empty')).toBe(true);
    expect(isEmptyRealmSizeLabel('tiny')).toBe(false);
    expect(getRealmSizeTooltip(5)).toBe('Realm size: 5 reactions');
  });
});
