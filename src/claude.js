import { config } from './config.js';

// SDKは実処理時のみ動的import(dry-run等でSDK未導入でも動くように)
let client;
async function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY が未設定です');
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic();
  }
  return client;
}

const SYSTEM = `あなたは肉牛の肥育農家向けに畜産情報をキュレーションする編集アシスタントです。
現場の生産者がすぐ使える形で、正確・簡潔に日本語でまとめます。
出力は必ず指定のJSONのみ。前置きや説明文は書かないこと。`;

function buildUserPrompt(item) {
  if (item.source.mode === 'headline') {
    // ★見出しのみ(本文なし)。権利面に配慮し、翻訳+話題推測に留める。
    return `次は海外業界メディアの「見出し」のみです(本文はありません)。
見出し: ${item.title}

以下のJSONだけを返してください:
{
  "lines": ["<見出しの日本語訳>", "<何の話題かの推測を1行>"],
  "comment": "<現場コメントを書くならこの観点、を1行>",
  "importance": "<高|中|低>"
}`;
  }

  const ctx = item.context
    ? `\n参考本文(要約の材料。丸写し(転載)禁止・自分の言葉で):\n${item.context.slice(0, 1500)}`
    : '';
  return `次の畜産関連の情報を、現場の肥育農家向けに日本語3行で要約してください。
海外ソースの場合は翻訳込みで。原文の丸写し(転載)は禁止で、必ず自分の言葉で書き直すこと。
見出し: ${item.title}${ctx}

以下のJSONだけを返してください:
{
  "lines": ["<1行目>", "<2行目>", "<3行目>"],
  "comment": "<現場コメントを書くならこの観点、を1行>",
  "importance": "<高|中|低。疾病発生・相場に直結するものを高>"
}`;
}

function parseJson(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('JSON not found in response');
  return JSON.parse(text.slice(s, e + 1));
}

async function processOne(item) {
  const anthropic = await getClient();
  const res = await anthropic.messages.create({
    model: config.model,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildUserPrompt(item) }],
  });
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const parsed = parseJson(text);
  return {
    ...item,
    lines: Array.isArray(parsed.lines) ? parsed.lines : [String(parsed.lines || '')],
    comment: parsed.comment || '',
    importance: ['高', '中', '低'].includes(parsed.importance) ? parsed.importance : '中',
  };
}

// 単純な並列プール。1件失敗しても全体は止めない。
export async function processItems(items) {
  const out = [];
  const queue = [...items];
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        out.push(await processOne(item));
      } catch (e) {
        console.warn(`  Claude処理失敗(${item.url}): ${e.message}`);
        out.push({
          ...item,
          lines: [item.title],
          comment: '(自動要約に失敗。元記事を参照)',
          importance: '中',
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, config.claudeConcurrency) }, worker),
  );
  return out;
}
