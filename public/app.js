// Frontend logic. Talks to the Express API.
const $ = (id) => document.getElementById(id);
const api = {
  glossary: () => fetch('/api/glossary').then((r) => r.json()),
  lookup: (term) => fetch('/api/lookup?q=' + encodeURIComponent(term)).then(j),
  translateTerm: (w) => fetch('/api/translate-term', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w) }).then(j),
  add: (term, meaningPt, category) => fetch('/api/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ term, meaningPt, category }) }).then(j),
  setCategory: (romaji, category) => fetch('/api/category/' + encodeURIComponent(romaji), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }) }).then(j),
  del: (romaji) => fetch('/api/word/' + encodeURIComponent(romaji), { method: 'DELETE' }).then(j),
  translate: (romaji) => fetch('/api/translate/' + encodeURIComponent(romaji), { method: 'POST' }).then(j),
  answer: (romaji, result) => fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ romaji, result }) }).then(j),
};
async function j(r) { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'error'); return d; }

let words = [];
let filter = 'all'; // 'all' | 'pos:noun' | 'cat:greetings' | 'cat:' (uncategorized)
let romajiPrimary = localStorage.getItem('romajiPrimary') === '1'; // false = kana big (default)

// reading display split by the toggle
function kanaForm(w) { return `${w.kana} ・${w.kanji}`; }
function primaryReading(w) { return romajiPrimary ? w.romaji : kanaForm(w); }
function secondaryReading(w) { return romajiPrimary ? kanaForm(w) : w.romaji; }

// ---- tabs ----
function show(tab) {
  $('view-glossary').style.display = tab === 'glossary' ? '' : 'none';
  $('view-quiz').style.display = tab === 'quiz' ? '' : 'none';
  $('tab-glossary').classList.toggle('active', tab === 'glossary');
  $('tab-quiz').classList.toggle('active', tab === 'quiz');
  if (tab === 'quiz') startQuiz();
}
$('tab-glossary').onclick = () => show('glossary');
$('tab-quiz').onclick = () => show('quiz');

// romaji ⇄ kana primary toggle
function applyToggleLabel() {
  $('romajiToggle').classList.toggle('active', romajiPrimary);
  $('romajiToggle').textContent = romajiPrimary ? 'Aa ⇄ あ' : 'あ ⇄ Aa';
}
$('romajiToggle').onclick = () => {
  romajiPrimary = !romajiPrimary;
  localStorage.setItem('romajiPrimary', romajiPrimary ? '1' : '0');
  applyToggleLabel();
  renderGlossary();
  if ($('view-quiz').style.display !== 'none' && current && !answered) renderCard();
};
applyToggleLabel();

// ---- glossary ----
function esc(s) { return (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ---- audio / spoken Japanese ----
// priority: cached human recording (Jisho) → offline Web Speech → Google TTS
const audioEl = new Audio();
function jaVoice() {
  return speechSynthesis.getVoices().find((v) => /ja[-_]?JP/i.test(v.lang) || /japanese/i.test(v.name));
}
function webSpeak(text) {
  if (!text || !('speechSynthesis' in window)) return false;
  const v = jaVoice();
  if (!v) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v; u.lang = 'ja-JP'; u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}
function playUrl(url) { audioEl.src = url; return audioEl.play(); }
async function speak(w) {
  const term = w.kanji || w.kana || w.romaji;
  const read = w.kana || w.kanji || w.romaji;
  // 1) human recording (best; cached after first fetch)
  try {
    const r = await fetch('/api/audio?q=' + encodeURIComponent(term));
    if (r.ok) { const { url } = await r.json(); await playUrl(url); return; }
  } catch { /* offline or none */ }
  // 2) offline browser TTS
  if (webSpeak(read)) return;
  // 3) Google TTS fallback
  try { await playUrl('/api/tts?text=' + encodeURIComponent(read)); } catch { /* give up */ }
}
// voices populate asynchronously in Chromium
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

function matchesFilter(w) {
  if (filter === 'all') return true;
  if (filter.startsWith('pos:')) return (w.pos || 'other') === filter.slice(4);
  if (filter.startsWith('cat:')) return (w.category || '') === filter.slice(4);
  return true;
}

function renderFilters() {
  const posCount = {}, catCount = {};
  for (const w of words) {
    posCount[w.pos || 'other'] = (posCount[w.pos || 'other'] || 0) + 1;
    if (w.category) catCount[w.category] = (catCount[w.category] || 0) + 1;
  }
  const chips = [`<button class="chip ${filter === 'all' ? 'active' : ''}" data-f="all">All<span class="n">${words.length}</span></button>`];
  // auto categories (part of speech)
  for (const p of Object.keys(posCount).sort())
    chips.push(`<button class="chip ${filter === 'pos:' + p ? 'active' : ''}" data-f="pos:${p}">${p}<span class="n">${posCount[p]}</span></button>`);
  // custom categories
  for (const c of Object.keys(catCount).sort())
    chips.push(`<button class="chip ${filter === 'cat:' + c ? 'active' : ''}" data-f="cat:${esc(c)}">#${esc(c)}<span class="n">${catCount[c]}</span></button>`);
  const fl = $('filters');
  fl.innerHTML = chips.join('');
  fl.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; renderGlossary(); });
}

function renderGlossary() {
  renderFilters();
  const tb = $('rows');
  tb.innerHTML = '';
  const list = words.filter(matchesFilter);
  $('emptyG').style.display = list.length ? 'none' : '';
  for (const w of list) {
    const tr = document.createElement('tr');
    const ptCell = w.meaningPt
      ? `<span class="pt">${esc(w.meaningPt)}</span>`
      : `<button class="badge" data-pt="${esc(w.romaji)}" style="cursor:pointer;border:1px solid var(--line);border-radius:6px;padding:2px 6px;background:none;color:var(--mut)">+ PT</button>`;
    const catTag = w.category
      ? `<span class="tag cat" data-cat="${esc(w.romaji)}">#${esc(w.category)}</span>`
      : `<span class="tag cat add" data-cat="${esc(w.romaji)}">+ category</span>`;
    tr.innerHTML =
      `<td class="jp-cell"><button class="spk" data-spk="${esc(w.romaji)}" title="Play pronunciation">🔊</button>${esc(primaryReading(w))}<div class="badge">${esc(secondaryReading(w))}</div></td>` +
      `<td>${ptCell}<div class="en">${esc(w.meaning)}</div></td>` +
      `<td><span class="tag pos">${esc(w.pos || 'other')}</span>${catTag}</td>` +
      `<td>${esc(w.jlpt).replace('jlpt-', '') || '—'}</td>` +
      `<td>${w.correct || 0}/${w.seen || 0}</td>` +
      `<td><button class="x" data-del="${esc(w.romaji)}">✕</button></td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll('[data-spk]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    speak(words.find((x) => x.romaji === b.dataset.spk));
  });
  tb.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    await api.del(b.dataset.del); await refresh();
  });
  tb.querySelectorAll('[data-pt]').forEach((b) => b.onclick = async () => {
    b.textContent = '…'; await api.translate(b.dataset.pt); await refresh();
  });
  tb.querySelectorAll('[data-cat]').forEach((el) => el.onclick = () => editCategory(el));
}

// inline category editor (prompt() is blocked in sandboxed previews)
function editCategory(el) {
  const romaji = el.dataset.cat;
  const w = words.find((x) => x.romaji === romaji);
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.setAttribute('list', 'catList');
  inp.value = w?.category || '';
  inp.placeholder = 'category (empty = clear)';
  inp.style.cssText = 'width:130px;font-size:13px;padding:3px 7px;background:var(--bg);border:1px solid var(--warn);color:var(--fg);border-radius:6px';
  el.replaceWith(inp);
  inp.focus();
  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    await api.setCategory(romaji, inp.value.trim().toLowerCase());
    await refresh();
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') { done = true; renderGlossary(); }
  });
  inp.addEventListener('blur', commit);
}

async function refresh() { words = await api.glossary(); renderGlossary(); }

// search -> preview (no save)
async function searchWord() {
  const term = $('term').value.trim();
  if (!term) return;
  const btn = $('searchBtn'), pv = $('preview');
  btn.disabled = true; $('addMsg').textContent = 'Searching…';
  pv.style.display = 'none';
  try {
    const w = await api.lookup(term);
    $('addMsg').textContent = `Found via ${w.source === 'jmdict' ? 'offline JMdict' : 'Jisho'}.`;
    renderPreview(term, w);
  } catch (e) {
    pv.className = 'preview miss';
    pv.style.display = '';
    pv.textContent = '✗ ' + (e.message === 'not found' ? `No match for "${term}".` : e.message);
    $('addMsg').textContent = '';
  } finally {
    btn.disabled = false; $('term').focus();
  }
}

function renderPreview(term, w) {
  const pv = $('preview');
  pv.className = 'preview';
  pv.style.display = '';
  const dupe = words.some((x) => x.romaji === w.romaji);
  // PT is optional: empty field, user can type one or auto-translate.
  pv.innerHTML =
    `<div class="reading"><button class="spk" id="pvSpk" title="Play pronunciation">🔊</button>${esc(w.kana)} ・${esc(w.kanji)}<span class="romaji">${esc(w.romaji)}</span></div>` +
    `<div class="pv-en">${esc(w.meaning)}</div>` +
    `<div class="pv-pos"><span class="tag pos">${esc(w.pos || 'other')}</span> <span class="badge">auto category</span></div>` +
    `<div class="pv-meta">source: ${esc(w.source)}${w.jlpt ? ' · ' + esc(w.jlpt).replace('jlpt-', '').toUpperCase() : ''}</div>` +
    `<div class="pv-pt-row row" style="margin-top:10px">` +
      `<input id="ptInput" type="text" placeholder="Portuguese (optional — type or auto-translate)" value="${esc(w.meaningPt || '')}" />` +
      `<button id="ptBtn" class="act" style="background:var(--warn)">Translate to PT</button>` +
    `</div>` +
    `<div class="row" style="margin-top:8px">` +
      `<input id="catInput" type="text" list="catList" placeholder="Custom category (optional — objects, phrases, greetings…)" />` +
    `</div>` +
    `<div class="pv-actions">` +
      `<button id="confirmAdd" class="act">+ Add to glossary</button>` +
      (dupe ? `<span class="dupe">already in glossary — adding refreshes it</span>` : '') +
    `</div>`;
  $('pvSpk').onclick = () => speak(w);
  $('ptBtn').onclick = () => translatePreview(w);
  $('confirmAdd').onclick = () => confirmAdd(term);
}

// auto-translate the previewed word into the PT field (on demand)
async function translatePreview(w) {
  const btn = $('ptBtn'), inp = $('ptInput');
  btn.disabled = true; btn.textContent = '…';
  try {
    const { meaningPt } = await api.translateTerm({ kanji: w.kanji, kana: w.kana, meaning: w.meaning });
    inp.value = meaningPt || '';
    if (!meaningPt) $('addMsg').textContent = 'No translation returned — type one manually.';
  } catch (e) {
    $('addMsg').textContent = '✗ translate: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Translate to PT';
  }
}

// commit the previewed term with whatever PT is in the field (may be empty)
async function confirmAdd(term) {
  const btn = $('confirmAdd');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const w = await api.add(term, $('ptInput').value.trim(), $('catInput').value.trim().toLowerCase());
    $('addMsg').textContent = `Added ${w.kana} ・${w.kanji} [${w.pos || 'other'}${w.category ? ' · #' + w.category : ''}]` + (w.meaningPt ? ` (pt: ${w.meaningPt})` : '');
    $('term').value = '';
    $('preview').style.display = 'none';
    await refresh();
  } catch (e) {
    btn.disabled = false; btn.textContent = '+ Add to glossary';
    $('addMsg').textContent = '✗ ' + e.message;
  } finally {
    $('term').focus();
  }
}

$('searchBtn').onclick = searchWord;
$('term').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchWord(); });
// clear the preview + message when the search bar is emptied
$('term').addEventListener('input', () => {
  if ($('term').value.trim() === '') {
    $('preview').style.display = 'none';
    $('preview').innerHTML = '';
    $('addMsg').textContent = '';
  }
});

// ---- quiz ----
// multiple-choice, random order, two directions.
let queue = [], current = null, answered = false;
let quizDir = localStorage.getItem('quizDir') || 'jp2en'; // jp2en | en2jp

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// what the prompt shows, and what an option shows, depend on direction
function promptText(w) {
  if (quizDir === 'jp2en') return { main: primaryReading(w), sub: secondaryReading(w) };
  // en2jp: show the meaning, hide the Japanese
  return { main: (w.meaning || '').split(';').slice(0, 2).join('; '), sub: w.meaningPt ? 'pt: ' + w.meaningPt : '' };
}
function optionLabel(w) {
  if (quizDir === 'jp2en') return (w.meaning || '').split(';').slice(0, 2).join('; ') || w.romaji;
  // meaning → JP: show kana・kanji with the romaji transcription
  return `${w.kana} ・${w.kanji}  (${w.romaji})`;
}

function startQuiz() {
  updateDirButtons();
  queue = shuffle(words); // random order each run
  nextCard();
}

function updateDirButtons() {
  $('dirJp').classList.toggle('active', quizDir === 'jp2en');
  $('dirEn').classList.toggle('active', quizDir === 'en2jp');
}

function nextCard() {
  answered = false;
  $('qReveal').innerHTML = '';
  if (!queue.length) {
    current = null;
    $('qPrompt').textContent = words.length ? '✓ done' : '—';
    $('qRomaji').textContent = words.length ? 'cycle finished — press ↻ shuffle' : 'glossary empty — add words first';
    $('qOptions').innerHTML = '';
    $('qStats').textContent = '';
    $('qSpk').style.display = 'none';
    return;
  }
  current = queue.shift();
  renderCard();
}

// render prompt + multiple-choice options for `current`
function renderCard() {
  if (!current) return;
  answered = false;
  $('qReveal').innerHTML = '';
  const p = promptText(current);
  $('qPrompt').textContent = p.main;
  $('qRomaji').textContent = p.sub;
  // speaking the answer would spoil the en2jp direction — reveal it after answering
  $('qSpk').style.display = quizDir === 'jp2en' ? '' : 'none';

  // build choices: correct word + up to 3 distinct distractors, shuffled
  const distractors = shuffle(words.filter((w) => w.romaji !== current.romaji)).slice(0, 3);
  const choices = shuffle([current, ...distractors]);
  const opts = $('qOptions');
  opts.innerHTML = '';
  for (const w of choices) {
    const b = document.createElement('button');
    b.className = 'qopt';
    b.textContent = optionLabel(w);
    b.onclick = () => pick(w, b);
    opts.appendChild(b);
  }
  $('qStats').textContent = `${queue.length} left · seen ${current.seen || 0}× · ${current.correct || 0} correct`;
}

async function pick(w, btn) {
  if (answered) return;
  answered = true;
  const ok = w.romaji === current.romaji;
  // mark buttons: chosen + the correct one
  for (const b of $('qOptions').children) {
    b.disabled = true;
    if (b.textContent === optionLabel(current)) b.classList.add('correct');
  }
  if (!ok) btn.classList.add('wrong');
  // reveal full answer
  $('qReveal').innerHTML =
    `<span class="feedback ${ok ? 'ok' : 'no'}">${ok ? '✓ correct' : '✗'}</span> — ` +
    `${esc(current.kana)} ・${esc(current.kanji)} = ${esc(current.meaning)}` +
    (current.meaningPt ? `<span class="pt">pt: ${esc(current.meaningPt)}</span>` : '');
  $('qSpk').style.display = ''; // now safe to hear it
  await api.answer(current.romaji, ok ? 'correct' : 'wrong');
  words = await api.glossary();
}

function setDir(dir) {
  quizDir = dir;
  localStorage.setItem('quizDir', dir);
  updateDirButtons();
  startQuiz();
}

$('qSpk').onclick = () => { if (current) speak(current); };
$('dirJp').onclick = () => setDir('jp2en');
$('dirEn').onclick = () => setDir('en2jp');
$('qRestart').onclick = startQuiz;
$('qNext').onclick = nextCard;

refresh();
