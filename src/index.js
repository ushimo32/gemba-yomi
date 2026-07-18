import { writeFile, mkdir, appendFile } from 'node:fs/promises';
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

// GitHub Actions の後続ステップ(メール通知)へ実行結果を渡す。
// CI以外($GITHUB_OUTPUT未設定)では何もしない。
// status: seeded | no-new | all-skipped | generated
async function emitOutput(fields) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = [];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      // 複数行値はヒアドキュメント形式で出力
      const delim = `EOF_${k}_${Math.random().toString(36).slice(2)}`;
      lines.push(`${k}<<${delim}`, v.join('\n'), delim);
    } else {
      lines.push(`${k}=${String(v).replace(/\r?\n/g, ' ')}`);
    }
  }
  await appendFile(file, lines.join('\n') + '\n', 'utf-8');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isSeed = args.has('--seed');
  const isDryRun = args.has('--dry-run');
  const dateStr = todayJst();

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
    await emitOutput({ status: 'seeded', date: dateStr, total: collected.length, domestic: 0, foreign: 0, high: 0, skipped: 0, high_titles: [] });
    return;
  }

  if (fresh.length === 0) {
    console.log('新着なし。下書きは生成しません。');
    await emitOutput({ status: 'no-new', date: dateStr, total: 0, domestic: 0, foreign: 0, high: 0, skipped: 0, high_titles: [] });
    return;
  }

  if (isDryRun) {
    for (const it of fresh) console.log(` - [${it.source.id}] ${it.title}  ${it.url}`);
    console.log('(--dry-run のため Claude処理・書き出しはスキップ)');
    return;
  }

  console.log('Claudeで下ごしらえ中...');
  const processed = await processItems(fresh);
  const visible = processed.filter((p) => !p.skip);
  const skipped = processed.length - visible.length;
  console.log(`要約対象: ${visible.length}件(畜種フィルタでスキップ ${skipped}件)`);

  // スキップ項目も含め、処理した全件をseen.jsonに登録(再処理を防ぐ)
  const now = new Date().toISOString();
  for (const it of fresh) state[it.key] = now;
  await saveState(STATE_PATH, state);
  console.log('state更新完了');

  if (visible.length === 0) {
    console.log('要約対象が0件(全てスキップ)。下書きは生成しません。');
    await emitOutput({ status: 'all-skipped', date: dateStr, total: 0, domestic: 0, foreign: 0, high: 0, skipped, high_titles: [] });
    return;
  }

  const md = renderDraft(visible, dateStr);
  await mkdir(DRAFTS_DIR, { recursive: true });
  const outPath = join(DRAFTS_DIR, `${dateStr}.md`);
  await writeFile(outPath, md, 'utf-8');
  console.log(`下書き生成: drafts/${dateStr}.md`);

  const domestic = visible.filter((i) => i.source.group === '国内').length;
  const foreign = visible.filter((i) => i.source.group === '海外').length;
  const highItems = visible.filter((i) => i.importance === '高');
  // 重要度「高」の日本語見出し(lines[0]は要約/翻訳の1行目=常に日本語)
  const highTitles = highItems.map((i) => i.lines[0] || i.title);
  await emitOutput({
    status: 'generated',
    date: dateStr,
    total: visible.length,
    domestic,
    foreign,
    high: highItems.length,
    skipped,
    high_titles: highTitles,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
