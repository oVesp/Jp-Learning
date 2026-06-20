// Web interface. Express + static frontend.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lookup } from './lookup.js';
import { load, save, upsert, find } from './store.js';
import { toPortuguese } from './translate.js';
import { warm, ready } from './jmdict.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Japanese DB running: http://localhost:${PORT}`);
  if (ready()) {
    console.log('warming JMdict index…');
    warm();
    console.log('JMdict ready (offline lookups).');
  } else {
    console.log('JMdict index missing — using Jisho online only. Run: node scripts/build-index.js');
  }
});
