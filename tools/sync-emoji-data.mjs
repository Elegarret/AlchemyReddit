import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const source = resolve(
  repoRoot,
  'node_modules',
  'emoji-picker-element-data',
  'en',
  'emojibase',
  'data.json'
);
const target = resolve(repoRoot, 'public', 'emoji-data.json');

if (!existsSync(source)) {
  throw new Error(
    `Missing emoji-picker-element-data source file at ${source}. Run npm install first.`
  );
}

copyFileSync(source, target);
console.log(`Synced emoji data from ${source} to ${target}`);
