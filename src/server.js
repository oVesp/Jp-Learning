// Web interface. Express + static frontend.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lookup } from './lookup.js';
import { load, save, upsert, find } from './store.js';
import { toPortuguese } from './translate.js';
import { warm, ready } from './jmdict.js';
import { getHumanAudio, cacheDir } from './audio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// --- audio ---
app.use('/audio', express.static(cacheDir()));

// human pronunciation (JapanesePod101 via Jisho). Returns a cached mp3 url or 404.
app.get('/api/audio', async (req, res) => {
  const term = (req.query.q ?? '').toString().trim();
  if (!term) return res.status(400).json({ error: 'missing q' });
  try {
    const file = await getHumanAudio(term);
    if (!file) return res.status(404).json({ error: 'no audio' });
    res.json({ url: '/audio/' + encodeURIComponent(file) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Google TTS fallback. Proxies the mp3 (server-side to avoid CORS/referer issues).
app.get('/api/tts', async (req, res) => {
  const text = (req.query.text ?? '').toString().slice(0, 180);
  if (!text) return res.status(400).end();
  const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=ja&q=${encodeURIComponent(text)}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`status ${r.status}`);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(await r.arrayBuffer()));
    } catch {
      await new Promise((s) => setTimeout(s, 300 * (i + 1)));
    }
  }
  res.status(502).end();
});

// --- glossary ---
app.get('/api/glossary', (_req, res) => res.json(load()));

// preview lookup without saving. Fast/offline by default.
// Pass ?pt=1 to also fetch Portuguese (slower, online).
app.get('/api/lookup', async (req, res) => {
  const term = (req.query.q ?? '').toString().trim();
  if (!term) return res.status(400).json({ error: 'missing q' });
  try {
    const word = await lookup(term, { pt: req.query.pt === '1' });
    if (!word) return res.status(404).json({ error: 'not found' });
    res.json(word);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// translate an arbitrary (un-saved) word to PT. body: {kanji, kana, meaning}
app.post('/api/translate-term', async (req, res) => {
  const { kanji, kana, meaning } = req.body ?? {};
  if (!kanji && !kana && !meaning) return res.status(400).json({ error: 'missing word' });
  try {
    res.json({ meaningPt: await toPortuguese({ kanji, kana, meaning }) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// add (looks up then stores). PT is optional:
//   - if body.meaningPt is provided, it is stored as-is (manual or pre-translated)
//   - otherwise no PT is fetched (keeps add fast); backfill later via /api/translate
app.post('/api/add', async (req, res) => {
  const term = (req.body?.term ?? '').toString().trim();
  if (!term) return res.status(400).json({ error: 'missing term' });
  try {
    const word = await lookup(term); // no auto-PT
    if (!word) return res.status(404).json({ error: 'not found' });
    if (req.body?.meaningPt != null) word.meaningPt = String(req.body.meaningPt).trim();
    // custom category (objects, phrases, greetings, …); pos = auto category
    if (req.body?.category != null) word.category = String(req.body.category).trim().toLowerCase();
    upsert(word);
    res.json(word);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// set/clear the custom category of a stored word. body: { category }
app.post('/api/category/:romaji', (req, res) => {
  const words = load();
  const w = find(words, req.params.romaji);
  if (!w) return res.status(404).json({ error: 'not found' });
  w.category = String(req.body?.category ?? '').trim().toLowerCase();
  save(words);
  res.json(w);
});

app.delete('/api/word/:romaji', (req, res) => {
  const words = load().filter((w) => w.romaji !== req.params.romaji);
  save(words);
  res.json({ ok: true });
});

// translate a single word on demand (backfill PT)
app.post('/api/translate/:romaji', async (req, res) => {
  const words = load();
  const w = find(words, req.params.romaji);
  if (!w) return res.status(404).json({ error: 'not found' });
  w.meaningPt = await toPortuguese(w);
  save(words);
  res.json(w);
});

// record quiz result. body: { romaji, result: 'correct'|'wrong' }
app.post('/api/answer', (req, res) => {
  const { romaji, result } = req.body ?? {};
  const words = load();
  const w = find(words, romaji);
  if (!w) return res.status(404).json({ error: 'not found' });
  w.seen = (w.seen ?? 0) + 1;
  if (result === 'correct') w.correct = (w.correct ?? 0) + 1;
  else w.wrong = (w.wrong ?? 0) + 1;
  save(words);
  res.json(w);
});

// Start the server. Resolves with the bound port once listening.
// port 0 lets the OS pick a free port (used by the desktop app).
export function start(port = process.env.PORT ?? 3000) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const bound = server.address().port;
      console.log(`Japanese DB running: http://localhost:${bound}`);
      if (ready()) {
        warm();
        console.log('JMdict ready (offline lookups).');
      } else {
        console.log('JMdict index missing — using Jisho online only.');
      }
      resolve(bound);
    });
  });
}

// Run directly (node src/server.js) → start on the default port.
import { fileURLToPath as _f } from 'node:url';
if (process.argv[1] && _f(import.meta.url) === process.argv[1]) {
  start();
}
