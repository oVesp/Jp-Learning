// Add word(s) to glossary. Usage: node src/add.js kagi saifu ...
import { lookup } from './lookup.js';
import { upsert } from './store.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node src/add.js <romaji|kana|kanji> [more...]');
  process.exit(1);
}

for (const term of args) {
  try {
    const word = await lookup(term);
    if (!word) {
      console.log(`✗ ${term} — not found`);
      continue;
    }
    upsert(word);
    console.log(`✓ ${word.romaji}\t${word.kana} ・${word.kanji}\t${word.meaning}\t[pt: ${word.meaningPt}]`);
  } catch (e) {
    console.log(`✗ ${term} — error: ${e.message}`);
  }
}
