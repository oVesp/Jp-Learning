// Preprocess the full JMdict-eng dump into a slim lookup index.
// Run once after downloading: node scripts/build-index.js
// Output: data/jmdict-index.json  (key -> {kana, kanji, meaning})
//   keys = every kanji form (raw) + every kana reading normalized to hiragana.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toHiragana } from 'wanakana';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'data', 'jmdict-eng-3.6.2.json');
const OUT = join(__dirname, '..', 'data', 'jmdict-index.json');

console.log('reading dump…');
const dump = JSON.parse(readFileSync(SRC, 'utf8'));
console.log(`entries: ${dump.words.length}`);

const index = Object.create(null);

function pick(forms) {
  const common = forms.find((f) => f.common);
  return (common ?? forms[0])?.text ?? '';
}

// Map a JMdict part-of-speech tag to a coarse auto-category.
export function coarsePos(tag) {
  const t = tag || '';
  if (t === 'exp') return 'expression';
  if (t === 'int') return 'interjection';
  if (t.startsWith('n') || t === 'pn') return 'noun';
  if (t.startsWith('v')) return 'verb';
  if (t.startsWith('adj')) return 'adjective';
  if (t.startsWith('adv')) return 'adverb';
  if (t === 'prt') return 'particle';
  if (t === 'pref' || t === 'suf' || t === 'ctr') return 'affix';
  return 'other';
}

// First non-empty partOfSpeech across the senses, mapped to coarse.
function posOf(senses) {
  for (const s of senses ?? []) {
    if (s.partOfSpeech?.length) return coarsePos(s.partOfSpeech[0]);
  }
  return 'other';
}

// When several words share a normalized key (homophones like 水/ミズ),
// keep the strongest: prefer a real kanji word, then a common word.
function score(e) {
  return (e._hasKanji ? 2 : 0) + (e._c ? 1 : 0);
}
function put(key, entry) {
  if (!key) return;
  const prev = index[key];
  if (!prev || score(entry) > score(prev)) index[key] = entry;
}

for (const w of dump.words) {
  const kanji = pick(w.kanji);
  const kana = pick(w.kana);
  const meaning = (w.sense ?? [])
    .flatMap((s) => (s.gloss ?? []).filter((g) => g.lang === 'eng').map((g) => g.text))
    .slice(0, 4)
    .join('; ');
  if (!meaning) continue;
  const isCommon = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);
  const entry = { kana, kanji: kanji || kana, meaning, pos: posOf(w.sense), _c: isCommon, _hasKanji: w.kanji.length > 0 };

  for (const k of w.kanji) put(k.text, entry);
  for (const k of w.kana) put(toHiragana(k.text), entry);
}

// drop internal scoring flags before writing
for (const k in index) { delete index[k]._c; delete index[k]._hasKanji; }

const keys = Object.keys(index).length;
writeFileSync(OUT, JSON.stringify(index));
console.log(`wrote ${OUT} — ${keys} keys`);
