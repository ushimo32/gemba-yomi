import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectAll } from './collect.js';
import { processItems } from './claude.js';
import { renderDraft } from './render.js';
import { loadState, saveState } from './lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'state', 'seen.json');
const DRAFTS_DIR = join(ROOT, 'drafts');

function todayJst() {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isSeed = args.has('--seed');
  const isDryRun = args.has('--dry-run');

  console.log('== gemba-yomi 収集開始 ==');
  const state = await loadState(STATE_PATH);
  const stateEmpty = Object.keys(state).length === 0;

  const collected = await collectAll();
  const fresh = collected.filter((it) => !state[it.key]);
  console.log(`新着候補: ${fresh.length}件 (収集 ${collected.length}件中)`);

  // 初回 or --seed: stateを埋めるだけで下書きは作らない(過去分の氾濫防止)
  if (isSeed || stateEmpty) {
    const now = new Date().toISOString();
    for (const it of collected) state[it.key] = now;
    await saveState(STATE_PATH, state);
    console.log(`初期シード完了: ${collected.length}件をstateに記録(下書きは未生成)`);
    return;
  }

  if (fresh.length === 0) {
    console.log('新着なし。下書きは生成しません。');
    return;
  }

  if (isDryRun) {
    for (const it of fresh) console.log(` - [${it.source.id}] ${it.title}  ${it.url}`);
    console.log('(--dry-run のため Claude処理・書き出しはスキップ)');
    return;
  }

  console.log('Claudeで下ごしらえ中...');
  const processed = await processItems(fresh);

  const dateStr = todayJst();
  const md = renderDraft(processed, dateStr);
  await mkdir(DRAFTS_DIR, { recursive: true });
  const outPath = join(DRAFTS_DIR, `${dateStr}.md`);
  await writeFile(outPath, md, 'utf-8');
  console.log(`下書き生成: drafts/${dateStr}.md`);

  const now = new Date().toISOString();
  for (const it of fresh) state[it.key] = now;
  await saveState(STATE_PATH, state);
  console.log('state更新完了');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
