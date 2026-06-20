// Glossary storage. One JSON file. No native deps.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'glossary.json');

// Word shape:
// { romaji, kana, kanji, meaning, jlpt, addedAt, seen, correct, wrong }

export function load() {
  if (!existsSync(DB_PATH)) return [];
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}

export function save(words) {
  writeFileSync(DB_PATH, JSON.stringify(words, null, 2), 'utf8');
}

export function find(words, romaji) {
  return words.find((w) => w.romaji.toLowerCase() === romaji.toLowerCase());
}

export function upsert(word) {
  const words = load();
  const existing = find(words, word.romaji);
  if (existing) {
    Object.assign(existing, word);
  } else {
    words.push({
      seen: 0,
      correct: 0,
      wrong: 0,
      addedAt: new Date().toISOString(),
      ...word,
    });
  }
  save(words);
  return word;
}

export { DB_PATH };
