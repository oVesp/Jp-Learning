// Semi-flashcard. No timer. Show kana/kanji, expect translation.
// Modes:
//   node src/card.js          -> quiz (least-seen first)
//   node src/card.js list     -> spreadsheet view of all words
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { load, save } from './store.js';

const mode = process.argv[2];

function table() {
  const words = load();
  if (words.length === 0) return console.log('glossary empty. add words first.');
  console.log('romaji\tkana ・kanji\tmeaning\tseen\tcorrect');
  for (const w of words) {
    console.log(`${w.romaji}\t${w.kana} ・${w.kanji}\t${w.meaning}\t${w.seen}\t${w.correct}`);
  }
}

function norm(s) {
  return s.trim().toLowerCase().replace(/[.;]/g, '').replace(/\s+/g, ' ');
}

function matches(answer, meaning) {
  const want = meaning.split(';').map(norm);
  return want.includes(norm(answer));
}

async function quiz() {
  const words = load();
  if (words.length === 0) return console.log('glossary empty. add words first.');
  // least-seen first = spaced-ish, use-count based, no timer
  words.sort((a, b) => a.seen - b.seen);

  const rl = createInterface({ input: stdin, output: stdout });
  console.log('Type translation. Blank = reveal. "q" = quit.\n');

  for (const w of words) {
    console.log(`${w.kana} ・${w.kanji}`);
    const ans = await rl.question('> ');
    if (norm(ans) === 'q') break;
    w.seen++;
    if (ans.trim() === '') {
      console.log(`  ${w.meaning}\n`);
      w.wrong++;
    } else if (matches(ans, w.meaning)) {
      console.log('  ✓ correct\n');
      w.correct++;
    } else {
      console.log(`  ✗ — ${w.meaning}\n`);
      w.wrong++;
    }
  }
  rl.close();
  save(words);
  console.log('progress saved.');
}

if (mode === 'list') table();
else await quiz();
