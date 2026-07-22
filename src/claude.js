import { config } from './config.js';
import { glossaryText } from './glossary.js';

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

// 対象読者の定義(すべての判断の基準)
const READER = `読者は日本の牛の現場で働く人(肥育中心、繁殖・酪農も含む)。
すべての要約・重要度判定・コメント観点は、この読者にとっての価値で判断すること。`;

const SYSTEM = `あなたは日本の牛の生産者向けに畜産情報をキュレーションする編集アシスタントです。
${READER}
正確・簡潔に日本語でまとめます。出力は必ず指定のJSONのみ。前置きや説明文は書かないこと。`;

// 全モード共通の評価基準(畜種フィルタ・重要度・コメント観点・用語集)
const CRITERIA = `## 対象畜種
- 牛以外の畜種(羊・豚・鶏など)のみの話題は原則スキップ(skip=true)。
- ただし疾病(豚熱・アフリカ豚熱・鳥インフルエンザ等)や制度・規制の変更など、牛の現場・業界に波及する話題は残す(skip=false)。
- 牛と他畜種の混合話題(牛・羊の市況まとめ等)は、牛に関する部分だけを要約対象にする。

## 重要度(日本の肥育経営の数字への直結度で判断。全件を「中」にせず必ず相対的に差をつける)
- 高: 素牛・枝肉の相場、飼料価格、疾病発生、制度・規制変更など、経営の数字に直接つながる話題。需要・消費の構造変化も、枝肉評価や販売戦略に返るため高に含める。
- 中: 飼養技術・研究・市場トレンドなど、参考になるが即座に数字は動かない話題。
- 低: 人物ルポ・イベント・組織の話題。
判定例:
- 「素牛の争奪戦(restockersとfeedlotの競合)」→ 高(素牛価格=導入コストに直結)
- 「ウェルネストレンドと赤身肉需要」→ 高(需要・消費の構造変化は枝肉評価・販売戦略に返る。需要側を軽視しない)
- 「マメ科飼料で増体向上」→ 中(有用な技術情報だが即座に経営数字は動かない)
- 「羊農家の人物ルポ」→ 対象外・skip=true(牛以外の畜種単独かつ人物もの)

## コメント観点
「確認したい」等の感想で終わらせず、日本の肥育現場の具体的な業務(素牛導入・飼料設計・出荷判断・増体管理・衛生対策)のいずれか1つと接続した観点を1文で書く。

## 発信元の正確性
- 発表主体はソースに忠実に書く。プロンプトに示した「発信元」がALICなら「ALIC(農畜産業振興機構)」、農林水産省なら「農林水産省」と表記する。
- 推測で省庁名・機関名を書かない。特に、ALICのRSS/ページ由来の発表を「農林水産省が公表」等と書かないこと(発表主体を取り違えない)。

## 情報が薄い場合の振る舞い
- 入力に具体的な数字・内容がない場合、一般論で3行を埋めない。
- その場合は要約の冒頭で「(数値はPDF/リンク先参照)」と明示したうえで、その発表が「何の指標・調査か」「読者(牛の現場)の何に関わるか」だけを簡潔に書く。
- 「重要である」「注視が必要」のような中身のない文は書かない。

## 翻訳用語集(英日。該当語はこの訳語を用いる)
${glossaryText()}`;

function buildUserPrompt(item) {
  if (item.source.mode === 'headline') {
    // ★見出しのみ(本文なし)。権利面に配慮し、翻訳+話題推測に留める。
    return `次は海外業界メディアの「見出し」のみです(本文はありません)。下記の基準に従って処理してください。
発信元(このニュースのソース): ${item.source.label}
見出し: ${item.title}

${CRITERIA}

以下のJSONだけを返してください:
{
  "skip": <true|false 上記「対象畜種」に照らしスキップ対象ならtrue>,
  "lines": ["<見出しの日本語訳>", "<何の話題かの推測を1行>"],
  "comment": "<現場業務に接続した観点を1文>",
  "importance": "<高|中|低>"
}`;
  }

  const ctx = item.context
    ? `\n参考本文(要約の材料。丸写し(転載)禁止・自分の言葉で):\n${item.context.slice(0, 1500)}`
    : '';
  return `次の畜産関連の情報を、下記の基準に従って処理してください。
海外ソースは翻訳込みで、原文の丸写し(転載)は禁止・必ず自分の言葉で書き直すこと。
牛と他畜種の混合話題は、牛に関する部分だけを日本語3行で要約すること。
発信元(このニュースのソース): ${item.source.label}
見出し: ${item.title}${ctx}

${CRITERIA}

以下のJSONだけを返してください:
{
  "skip": <true|false 上記「対象畜種」に照らしスキップ対象ならtrue>,
  "lines": ["<1行目>", "<2行目>", "<3行目>"],
  "comment": "<現場業務に接続した観点を1文>",
  "importance": "<高|中|低>"
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
    skip: parsed.skip === true,
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
          skip: false, // 失敗は落とさず可視化(後段で人が確認)
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
