// Japanese/English -> Portuguese (pt-BR). Multi-service with fallbacks.
// Primary:  MyMemory (free, no key, ~5k words/day anon).
// Fallback: Google gtx endpoint.
// Results are cached by callers (store meaningPt) so we don't re-hit per view.

// MyMemory REST API. langpair like "ja|pt-br".
async function myMemory(text, src) {
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
    `&langpair=${src}|pt-br`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const data = await res.json();
  if (data?.responseStatus !== 200) throw new Error('mymemory bad status');
  const t = (data?.responseData?.translatedText ?? '').trim();
  if (!t || /^NO QUERY|MYMEMORY WARNING/i.test(t)) throw new Error('mymemory empty');
  return t;
}

// Google free endpoint fallback.
async function gtx(text, src) {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${src}&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`gtx ${res.status}`);
  const data = await res.json();
  return (data?.[0] ?? []).map((seg) => seg[0]).join('').trim();
}

// Try each service for a given (text, sourceLang) until one returns something.
async function translateVia(text, src) {
  for (const svc of [myMemory, gtx]) {
    try {
      const out = await svc(text, src);
      if (out && out.toLowerCase() !== text.toLowerCase()) return out;
    } catch {
      /* try next service */
    }
  }
  return '';
}

// Translate a word to PT. Try the Japanese headword first (most direct),
// then fall back to the English gloss.
export async function toPortuguese({ kanji, kana, meaning }) {
  const jp = kanji || kana;
  if (jp) {
    const pt = await translateVia(jp, 'ja');
    if (pt) return pt.toLowerCase();
  }
  const firstGloss = (meaning || '').split(';')[0].trim();
  if (!firstGloss) return '';
  return (await translateVia(firstGloss, 'en')).toLowerCase();
}
