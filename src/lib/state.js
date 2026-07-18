import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// state/seen.json = { "<key>": "<初回検出ISO日時>" }
// 既知URLをキーで持ち、差分(新着)検出に使う。
export async function loadState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return {};
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
