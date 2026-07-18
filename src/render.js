const IMP_ORDER = { 高: 0, 中: 1, 低: 2 };

function fmtItem(it) {
  const lines = it.lines.map((l) => `  - ${l}`).join('\n');
  const dateStr = it.date ? ` (${it.date})` : '';
  return `#### ${it.title}${dateStr}
${lines}
- 出典: [${it.source.label}](${it.url})
- コメント観点: ${it.comment || '—'}
- 重要度: **${it.importance}**
`;
}

function section(title, items) {
  if (items.length === 0) return `### ${title}\n\n(今週は新着なし)\n`;
  const sorted = [...items].sort(
    (a, b) => IMP_ORDER[a.importance] - IMP_ORDER[b.importance],
  );
  return `### ${title}\n\n` + sorted.map(fmtItem).join('\n');
}

export function renderDraft(items, dateStr) {
  const domestic = items.filter((i) => i.source.group === '国内');
  const foreign = items.filter((i) => i.source.group === '海外');
  const high = items.filter((i) => i.importance === '高');

  const summary = [
    `# 今週の畜産ニュース下書き (${dateStr})`,
    '',
    '## 今週の収集サマリ',
    `- 収集件数: 合計 ${items.length}件(国内 ${domestic.length} / 海外 ${foreign.length})`,
    `- 重要度「高」: ${high.length}件`,
    ...(high.length ? high.map((i) => `  - ${i.title}`) : ['  - なし']),
    '',
  ].join('\n');

  const body = [
    '## 国内',
    '',
    section('農林水産省・ALIC 等', domestic),
    '',
    '## 海外',
    '',
    section('USDA / 豪州 / 業界メディア', foreign),
    '',
  ].join('\n');

  const deep = [
    '## 今週の深掘り候補(重要度「高」再掲)',
    '',
    high.length
      ? high
          .map(
            (i) =>
              `- **${i.title}** — [${i.source.label}](${i.url})\n  - ${i.lines.join(' / ')}`,
          )
          .join('\n')
      : '(なし)',
    '',
    '---',
    '',
    '> 本ファイルは自動生成の下書きです。公開前に内容・出典・権利面を必ず確認してください。',
    '> ALIC等の権利保護コンテンツは要約(自分の言葉)+出典明記に留めています。',
    '> 海外業界メディア(MLA/Beef Magazine)は見出し翻訳のみで、本文は取得・保存していません。',
    '',
  ].join('\n');

  return `${summary}\n${body}\n${deep}`;
}
