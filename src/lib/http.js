import { config } from '../config.js';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// UA・タイムアウト・リトライ付きのfetch。生バイト列(Buffer)を返す。
export async function fetchBuffer(url, { retries = 3, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': config.userAgent, Accept: '*/*' },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts) {
  const buf = await fetchBuffer(url, opts);
  return JSON.parse(buf.toString('utf-8'));
}
