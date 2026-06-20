// Word lookup. Accepts romaji, kana, or kanji.
// Source order: offline JMdict index first (fast, no rate limit),
// then Jisho online as fallback.
// Portuguese is OPTIONAL: only fetched (online MT) when { pt: true } is passed.
// Default keeps search fast and fully offline.
import JishoApi from 'unofficial-jisho-api';
import { toPortuguese } from './translate.js';
import { lookupLocal } from './jmdict.js';

const jisho = new JishoApi();

// Map Jisho's verbose parts_of_speech text to our coarse auto-category.
function coarsePosFromJisho(parts) {
  const p = (parts?.[0] ?? '').toLowerCase();
  if (p.includes('expression')) return 'expression';
  if (p.includes('interjection')) return 'interjection';
  if (p.includes('noun') || p.includes('pronoun')) return 'noun';
  if (p.includes('verb')) return 'verb';
  if (p.includes('adjective')) return 'adjective';
  if (p.includes('adverb')) return 'adverb';
  if (p.includes('particle')) return 'particle';
  return 'other';
}

// Direct API hit. Library caps at 10s; some queries (e.g. kagi) take longer.
async function directSearch(input, ms = 25000) {
  const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(input)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

// Returns normalized word object (+ source tag), or null if nothing found.
// opts.pt = true also fetches Portuguese (slow, online). Default false.
export async function lookup(input, opts = {}) {
  // 1) offline JMdict
  const local = lookupLocal(input);
  if (local) {
    local.source = 'jmdict';
    local.meaningPt = opts.pt ? await toPortuguese(local) : '';
    return local;
  }

  // 2) Jisho fallback
  let res;
  try {
    res = await jisho.searchForPhrase(input);
  } catch (e) {
    // fall back to direct fetch with a longer timeout
    res = await directSearch(input);
  }
  const data = res?.data?.[0];
  if (!data) return null;

  const jp = data.japanese?.[0] ?? {};
  const meanings = (data.senses ?? [])
    .flatMap((s) => s.english_definitions ?? [])
    .slice(0, 4);

  const word = {
    romaji: input.toLowerCase(),
    kana: jp.reading ?? '',
    kanji: jp.word ?? jp.reading ?? '',
    meaning: meanings.join('; '),
    pos: coarsePosFromJisho(data.senses?.[0]?.parts_of_speech),
    jlpt: (data.jlpt ?? [])[0] ?? '',
    source: 'jisho',
  };
  word.meaningPt = opts.pt ? await toPortuguese(word) : '';
  return word;
}
