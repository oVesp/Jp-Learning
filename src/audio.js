// Human pronunciation audio via Jisho (JapanesePod101 recordings).
// We fetch the word page and extract the mp3 ourselves (the library's
// scrapeForPhrase caps at 10s and times out). Cached to disk for instant,
// offline replays.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// writable cache dir (userData in the packaged app, else project ./audio-cache)
const CACHE = process.env.JPL_USER_DIR
  ? join(process.env.JPL_USER_DIR, 'audio')
  : join(__dirname, '..', 'audio-cache');

export function cacheDir() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  return CACHE;
}

// filename-safe key that keeps Japanese letters/digits
function keyFor(term) {
  return term.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 60);
}

// fetch with a few retries — calls to jisho/cloudfront flake intermittently
async function fetchRetry(url, opts = {}, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000), ...opts });
      if (!r.ok) throw new Error(`status ${r.status}`);
      return r;
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw last;
}

// Returns the cached mp3 filename for a term, or null if none is available.
export async function getHumanAudio(term) {
  cacheDir();
  const key = keyFor(term);
  const file = join(CACHE, key + '.mp3');
  if (existsSync(file)) return key + '.mp3';

  const html = await (await fetchRetry('https://jisho.org/word/' + encodeURIComponent(term))).text();
  const m = html.match(/<source[^>]+src="([^"]+\.mp3)"/i);
  if (!m) return null;

  const url = m[1].startsWith('http') ? m[1] : 'https:' + m[1];
  const resp = await fetchRetry(url, { headers: {} });
  writeFileSync(file, Buffer.from(await resp.arrayBuffer()));
  return key + '.mp3';
}
