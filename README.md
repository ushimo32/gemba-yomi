# gemba-yomi

畜産・肉牛関係の情報を週1回収集し、note下書き用のマークダウン(`drafts/YYYY-MM-DD.md`)を自動生成するツール。

> **⚠️ 運用メモ(必読)**
> ALICは転載禁止(引用・私的使用を除く)です。生成される下書きの要約は、**公開前に必ず人間がレビューし、原文の丸写しになっていないか**を確認してから使用してください。要約は自分の言葉で書き直したものである必要があります。

毎週金曜の夜(JST)にGitHub Actionsで実行し、各ソースから直近の新着を集めて、Claude API で現場の肥育農家向けに下ごしらえ(要約・翻訳・観点メモ・重要度判定)します。

## 動作フロー

1. 各ソースから新着を収集(`state/seen.json` で既知URLを管理し差分検出)
2. Claude API(`claude-sonnet-4-6`)で各項目を処理
   - 3行要約(海外ソースは翻訳込み)
   - 「現場コメントを書くなら」という観点メモ1行
   - 重要度(高/中/低。疾病発生・相場直結を「高」)
3. `drafts/YYYY-MM-DD.md` を生成してコミット

## 収集ソースと扱い

| 記号 | ソース | 区分 | 取得方法 | モード |
|---|---|---|---|---|
| A | [ALIC(農畜産業振興機構)](https://www.alic.go.jp/rss.xml) | 国内 | RSS(Shift_JIS) | 全文要約(畜産キーワードで絞込) |
| B | [農林水産省 報道発表](https://www.maff.go.jp/j/press/index.html) | 国内 | 一覧スクレイピング | 全文要約(畜産局/家畜疾病のみ) |
| C | [USDA ESMIS](https://esmis.nal.usda.gov/) | 海外 | 公開JSON API | 全文要約(翻訳込み) |
| D | [MLA](https://www.mla.com.au/) / [Beef Magazine](https://www.beefmagazine.com/) | 海外 | RSS | ★見出し+リンクのみ |

### 権利面の扱い(重要)

- **ALIC**: [利用条件](https://www.alic.go.jp/about-this-site/index.html)により無断の転載・複製は禁止(例外は私的使用・引用)。本ツールは**要約(自分の言葉)+出典明記**に留め、原文本文は保存しません。出力は下書きであり、公開前レビュー前提です。
- **農林水産省**: [PDL1.0](https://www.maff.go.jp/j/use/link.html)準拠。出典明記で複製・編集可。本ツールは要約+出典明記。
- **USDA**: 米国政府著作物=パブリックドメイン。翻訳・転載に制約なし。
- **MLA / Beef Magazine(民間)**: 本文の転載は避け、**見出しの翻訳とリンクのみ**を収集(本文は取得・保存しない)。

### 農水省スクレイピングの注意

- ブラウザ相当のUAを設定(UAでbotを弾くため)。ソース間に数秒の間隔。
- 報道発表一覧の相対リンク(`./syouan/douei/...`)を絶対URLに解決し、`/j/press/chikusan/` または `/j/press/syouan/douei/` を含むものだけ採用。ナビゲーションの `/j/chikusan/`(`/press/` を含まない)は自動的に除外されます。
- 畜産局本体の報道発表は週によって一覧に出ない場合があります。家畜疾病(消費・安全局動物衛生課)は `syouan/douei/` に掲載されます。

## セットアップ

```bash
npm install
```

- Node.js 18以上(Shift_JIS復号に `TextDecoder('shift_jis')` を使用。full-ICU同梱のNode 18+が必要。Node 20推奨)
- `ANTHROPIC_API_KEY` を環境変数(本番は GitHub Secrets)に設定

## 使い方

```bash
# 初回シード(過去分の氾濫を防ぐため state を埋めるだけで下書きは作らない)
npm run seed

# 通常実行(新着を処理して drafts/ に下書き生成)
ANTHROPIC_API_KEY=sk-ant-... npm start

# 収集だけ確認(Claude処理・書き出しなし。APIキー不要)
npm run dry-run
```

初回は `state/seen.json` が空のため自動的にシードモードになり、下書きは生成されません。2回目以降の実行で新着分の下書きが出力されます。

### GitHub Actions

`.github/workflows/weekly.yml` が毎週金曜 20:00 JST(11:00 UTC)に実行。`workflow_dispatch` で手動実行も可能。

1. リポジトリの Settings → Secrets and variables → Actions で `ANTHROPIC_API_KEY` を登録
2. 初回はローカルまたは手動実行で `npm run seed` 相当を済ませておくと、いきなり過去分が大量に出るのを防げます

## APIコスト概算

- モデル: `claude-sonnet-4-6`($3 / 100万入力トークン、$15 / 100万出力トークン)
- 1項目あたり おおよそ 入力 約500〜1,500トークン + 出力 約250トークン
- 週30〜60件を想定すると **1回あたり おおよそ $0.2〜0.4**(月 **$1〜2程度**)
- 収集(HTTP/API)側は無料。コストはClaude処理のみ。

## ディレクトリ構成

```
gemba-yomi/
├── src/
│   ├── index.js        # オーケストレーション
│   ├── config.js       # ソース定義・パラメータ
│   ├── collect.js      # 各ソースの収集
│   ├── claude.js       # Claude API での下ごしらえ
│   ├── render.js       # マークダウン生成
│   └── lib/
│       ├── http.js     # fetch(UA・リトライ)
│       ├── rss.js      # RSS解析(Shift_JIS対応)
│       └── state.js    # 差分検出用の状態管理
├── state/seen.json     # 既知URL(コミット対象)
├── drafts/             # 生成された下書き(コミット対象)
└── .github/workflows/weekly.yml
```

## 収集対象の追加

`src/config.js` の `sources` に追記します。ESMISのレポートは `publications` に `{ name, pubId }` を追加(pubIdは ESMIS API の `publication/findByAgency` や `publication/search` で確認)。
