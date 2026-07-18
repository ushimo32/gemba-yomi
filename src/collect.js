import { fetchRssItems } from './lib/rss.js';
import { fetchBuffer, fetchJson, sleep } from './lib/http.js';
import { config, sources } from './config.js';

// 収集アイテムの共通形:
// { key, url, title, date, context, source }
//   key     … 重複判定キー(既定=url、ESMISはリリースID)
//   context … 要約の材料テキスト。headlineモードでは必ず空。

function matchesKeywords(text, keywords) {
  if (!keywords || keywords.length === 0) return true;
  return keywords.some((k) => text.includes(k));
}

async function collectRss(src) {
  const items = await fetchRssItems(src.url, src.encoding);
  const out = [];
  for (const it of items) {
    if (src.includeKeywords && !matchesKeywords(it.title, src.includeKeywords)) continue;
    out.push({
      key: it.link,
      url: it.link,
      title: it.title,
      date: it.pubDate || '',
      // ★headlineモード(D群)は本文を一切保持しない
      context: src.mode === 'headline' ? '' : it.description || '',
    });
  }
  return out;
}

async function collectMaffPress(src) {
  const buf = await fetchBuffer(src.url);
  const html = buf.toString('utf-8'); // 農水省はUTF-8
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    let abs;
    try {
      abs = new URL(m[1], src.url).href; // ./syouan/douei/... → /j/press/syouan/douei/...
    } catch {
      continue;
    }
    if (!src.pathIncludes.some((p) => abs.includes(p))) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push({ key: abs, url: abs, title: text, date: '', context: '' });
  }
  return out;
}

async function collectEsmis(src) {
  const out = [];
  const cutoff = Date.now() - config.maxAgeDays * 86400000;
  for (const pub of src.publications) {
    let data;
    try {
      data = await fetchJson(`${src.apiBase}/release/findByPubId/${pub.pubId}?page=0`);
    } catch (e) {
      console.warn(`  ESMIS ${pub.name} 取得失敗: ${e.message}`);
      continue;
    }
    for (const rel of data.results || []) {
      const dt = rel.release_datetime ? Date.parse(rel.release_datetime) : NaN;
      if (!Number.isNaN(dt) && dt < cutoff) continue; // 直近のみ
      const files = rel.files || [];
      const pdf = files.find((f) => f.endsWith('.pdf')) || files[0] || '';
      out.push({
        key: `esmis:${rel.id}`,
        url: pdf,
        title: `${pub.name} — ${rel.title || ''}`.trim(),
        date: rel.release_datetime || '',
        context: rel.description || '',
      });
    }
    await sleep(300);
  }
  return out;
}

async function collectSource(src) {
  if (src.kind === 'rss') return collectRss(src);
  if (src.kind === 'maff-press') return collectMaffPress(src);
  if (src.kind === 'esmis') return collectEsmis(src);
  throw new Error(`unknown source kind: ${src.kind}`);
}

// 発行日が maxAgeDays より古い項目を除外(全ソース共通)。
// 日付が取れない項目(MAFF等)は判定不能のため残し、seen.jsonの差分に委ねる。
function withinMaxAge(item) {
  const cutoff = Date.now() - config.maxAgeDays * 86400000;
  const t = item.date ? Date.parse(item.date) : NaN;
  return Number.isNaN(t) || t >= cutoff;
}

export async function collectAll() {
  const results = [];
  for (const src of sources) {
    try {
      let items = (await collectSource(src)).filter(withinMaxAge);
      if (items.length > config.maxItemsPerSource) {
        items = items.slice(0, config.maxItemsPerSource);
      }
      for (const it of items) results.push({ ...it, source: src });
      console.log(`  [${src.id}] ${items.length}件収集`);
    } catch (e) {
      console.warn(`  [${src.id}] 収集失敗: ${e.message}`);
    }
    await sleep(config.requestDelayMs);
  }
  return results;
}
