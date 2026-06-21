// Offline JP->EN lookup against the prebuilt JMdict index.
// Index loaded once (lazy) into memory. Keys: kanji forms (raw) +
// kana readings normalized to hiragana. Romaji input is converted too.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toHiragana } from 'wanakana';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Index is a read-only resource. In the packaged app JPL_RES_DIR points at the
// bundled resources/data folder; otherwise fall back to the project data dir.
const RES_DIR = process.env.JPL_RES_DIR || join(__dirname, '..', 'data');
const INDEX_PATH = join(RES_DIR, 'jmdict-index.json');

let index = null;
export function ready() {
  return existsSync(INDEX_PATH);
}
// Preload the index into memory (call at server boot to avoid first-request lag).
export function warm() {
  getIndex();
}
function getIndex() {
  if (index) return index;
  if (!ready()) return (index = {});
  index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  return index;
}

// Returns { romaji, kana, kanji, meaning, jlpt } or null.
// Note: JMdict has no JLPT level, so jlpt is always ''.
export function lookupLocal(input) {
  const idx = getIndex();
  const term = input.trim();
  const hit = idx[term] || idx[toHiragana(term)];
  if (!hit) return null;
  return {
    romaji: term.toLowerCase(),
    kana: hit.kana,
    kanji: hit.kanji,
    meaning: hit.meaning,
    pos: hit.pos || 'other',
    jlpt: '',
  };
}
