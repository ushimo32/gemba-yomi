import { fetchBuffer } from './http.js';

// XML宣言のencodingを優先し、なければヒント(config)→utf-8で復号。
// ALICはShift_JIS配信のため必須。
function decode(buffer, encodingHint) {
  const head = buffer.slice(0, 200).toString('latin1');
  const m = head.match(/encoding=["']([^"']+)["']/i);
  const enc = (m ? m[1] : encodingHint || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(enc).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .trim();
}

function pick(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

export async function fetchRssItems(url, encodingHint) {
  const buf = await fetchBuffer(url);
  const xml = decode(buf, encodingHint);
  const items = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let mm;
  while ((mm = re.exec(xml)) !== null) {
    const b = mm[1];
    const title = pick(b, 'title');
    const link = pick(b, 'link');
    const pubDate = pick(b, 'pubDate') || pick(b, 'dc:date');
    const description = pick(b, 'description');
    if (!link && !title) continue;
    items.push({ title, link, pubDate, description });
  }
  return items;
}
