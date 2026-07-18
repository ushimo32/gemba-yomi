// 収集ソースと動作パラメータの定義。
// group: 国内(A,B) / 海外(C,D)。mode: full=全文要約, headline=見出しのみ(権利配慮)。

export const config = {
  // ユーザー指定モデル
  model: 'claude-sonnet-4-6',
  // 発行日がこの日数より古い項目は全ソース共通で収集対象外
  maxAgeDays: 14,
  // 1ソースあたりの処理上限(初回の氾濫防止)
  maxItemsPerSource: 40,
  // Claude並列処理数
  claudeConcurrency: 4,
  // ブラウザ相当のUA(農水省はUAでbotを弾くため)
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  // ソース間のアクセス間隔(公的サイトへの配慮)
  requestDelayMs: 2500,
};

export const sources = [
  // A. ALIC(農畜産業振興機構)RSS —— Shift_JIS
  {
    id: 'alic',
    label: 'ALIC(農畜産業振興機構)',
    group: '国内',
    kind: 'rss',
    mode: 'full',
    url: 'https://www.alic.go.jp/rss.xml',
    encoding: 'shift_jis',
    // 新着情報全般(砂糖・でん粉・野菜も混在)のため畜産・肉牛関連に絞る
    includeKeywords: [
      '牛', '肉', '豚', '鶏', '鳥', '畜', '乳', '飼料', '酪農', '食肉',
      'バター', '脱脂粉乳', 'チーズ', 'ホエイ', 'と畜', '枝肉', '素牛',
      '肥育', '繁殖', '家きん', '鶏卵', 'BSE', '口蹄疫', '豚熱', '鳥インフル',
    ],
    // 権利メモ: 転載・複製は要許諾。要約は自分の言葉で+出典明記(下書きは公開前レビュー前提)
  },

  // B. 農林水産省 報道発表 —— RSSなし、一覧をスクレイピング
  {
    id: 'maff',
    label: '農林水産省 報道発表',
    group: '国内',
    kind: 'maff-press',
    mode: 'full',
    url: 'https://www.maff.go.jp/j/press/index.html',
    // 相対リンクを絶対URLに解決した後、以下を含むものだけ採用。
    // ナビの /j/chikusan/ 等(/press/ を含まない)は自然に除外される。
    pathIncludes: ['/j/press/chikusan/', '/j/press/syouan/douei/'],
  },

  // C. USDA ESMIS —— 公開JSON API(認証不要)
  {
    id: 'esmis',
    label: 'USDA ESMIS',
    group: '海外',
    kind: 'esmis',
    mode: 'full',
    apiBase: 'https://esmis.nal.usda.gov/api/v1',
    // pubIdは実APIで確認済み。追加時はfindByAgency/searchでpubIdを確認して追記。
    publications: [
      { name: 'Cattle on Feed (NASS)', pubId: 2270 },
      { name: 'Cattle(半期在庫 / NASS)', pubId: 1603 }, // 年2回・1月末/7月末
      { name: 'Livestock Slaughter (NASS)', pubId: 2233 },
      { name: 'Livestock, Dairy, and Poultry Outlook (ERS)', pubId: 1801 },
      { name: 'Feed Outlook (ERS)', pubId: 1762 },
      // WASDEは穀物全般で畜産比率が薄いため見送り(飼料穀物はFeed Outlookでカバー)
    ],
  },

  // D. MLA(豪州)—— ★見出しとリンクのみ。本文は取得・保存しない
  {
    id: 'mla',
    label: 'MLA (Meat & Livestock Australia)',
    group: '海外',
    kind: 'rss',
    mode: 'headline',
    url: 'https://www.mla.com.au/feed.rss?listID=95',
    encoding: 'utf-8',
  },

  // D. Beef Magazine —— ★見出しとリンクのみ
  {
    id: 'beefmag',
    label: 'Beef Magazine',
    group: '海外',
    kind: 'rss',
    mode: 'headline',
    url: 'https://www.beefmagazine.com/rss.xml',
    encoding: 'utf-8',
  },
];
