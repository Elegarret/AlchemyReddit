/// <reference types="node" />
// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type EmojiRecord = {
  emoji: string;
  tags?: string[];
};

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const readEmojiData = async (relativePath: string): Promise<EmojiRecord[]> => {
  const content = await readFile(resolve(repoRoot, relativePath), 'utf8');
  return JSON.parse(content) as EmojiRecord[];
};

const findEmoji = (data: EmojiRecord[], emoji: string) =>
  data.find((entry) => entry.emoji === emoji);

describe('emoji picker data', () => {
  it('matches the installed emoji-picker-element dataset snapshot', async () => {
    const [hosted, installed] = await Promise.all([
      readEmojiData('public/emoji-data.json'),
      readEmojiData(
        'node_modules/emoji-picker-element-data/en/emojibase/data.json'
      ),
    ]);

    expect(hosted).toEqual(installed);
  });

  it('includes the branch-related emoji metadata used by upstream search', async () => {
    const hosted = await readEmojiData('public/emoji-data.json');
    const leaflessTree = findEmoji(hosted, '🪾');

    expect(findEmoji(hosted, '🪹')?.tags).toContain('branch');
    expect(findEmoji(hosted, '🪺')?.tags).toContain('branch');
    expect(leaflessTree).toBeDefined();
    expect(leaflessTree?.tags).toContain('branches');
  });
});
