// 翻訳用語集。海外ソースの訳語を統一するために使う。今後も追記していく前提。
// { en: 英語表現, ja: 訳語(補足含む) }
export const glossary = [
  { en: 'restocker(s)', ja: '育成農家(素牛を放牧で育成する側)' },
  { en: 'feeder cattle', ja: '素牛' },
  { en: 'liveweight gain', ja: '増体' },
  { en: 'feedlot', ja: 'フィードロット(肥育場)' },
  { en: 'processor', ja: 'と畜・加工業者' },
  { en: 'boxed beef', ja: '部分肉' },
  { en: 'carcase (carcass)', ja: '枝肉' },
  { en: 'saleyard', ja: '家畜市場' },
  { en: 'young cattle indicator', ja: '若齢牛価格指標' },
];

export function glossaryText() {
  return glossary.map((g) => `- ${g.en} = ${g.ja}`).join('\n');
}
