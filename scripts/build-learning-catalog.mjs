// Builds the Learning app's book catalog from Sefaria's book shapes. Run with
// `node scripts/build-learning-catalog.mjs` from the repository root, then commit the output.
//
// It writes two files from the same data, so the frontend and backend never disagree:
// - frontend/src/apps/learning/catalog.json: every book with its segment count per section,
//   which the frontend uses to divide a corpus into daily portions
// - backend/internal/learning/books.json: each book's valid section range, used to validate refs
import { writeFile } from 'node:fs/promises'

const corpora = [
  {
    id: 'tanakh',
    shape: 'Tanakh',
    groups: { Torah: 'תורה', Prophets: 'נביאים', Writings: 'כתובים' },
  },
  {
    id: 'mishnah',
    shape: 'Mishnah',
    groups: {
      'Seder Zeraim': 'סדר זרעים',
      'Seder Moed': 'סדר מועד',
      'Seder Nashim': 'סדר נשים',
      'Seder Nezikin': 'סדר נזיקין',
      'Seder Kodashim': 'סדר קדשים',
      'Seder Tahorot': 'סדר טהרות',
    },
  },
  {
    // Sefaria's Bavli category also lists the minor tractates and commentaries; only the six orders are kept
    id: 'bavli',
    shape: 'Talmud/Bavli',
    talmud: true,
    groups: {
      'Seder Zeraim': 'סדר זרעים',
      'Seder Moed': 'סדר מועד',
      'Seder Nashim': 'סדר נשים',
      'Seder Nezikin': 'סדר נזיקין',
      'Seder Kodashim': 'סדר קדשים',
      'Seder Tahorot': 'סדר טהרות',
    },
  },
]

const catalog = {}
const books = {}

for (const corpus of corpora) {
  const res = await fetch(`https://www.sefaria.org/api/shape/${corpus.shape}`)
  if (!res.ok) throw new Error(`${corpus.shape}: HTTP ${res.status}`)
  const shapes = await res.json()

  const groups = []
  for (const s of shapes) {
    const groupHe = corpus.groups[s.section]
    if (!groupHe || !Array.isArray(s.chapters) || s.chapters.some((c) => typeof c !== 'number')) continue
    let group = groups.find((g) => g.en === s.section)
    if (!group) groups.push((group = { en: s.section, he: groupHe, books: [] }))

    // Sections are chapters (numbered from 1) or, for the Talmud, amudim indexed from 0 = 1a,
    // so 2 = 2a. Leading and trailing empty sections are trimmed and `start` records the first.
    let lengths = s.chapters
    let start = corpus.talmud ? 0 : 1
    while (lengths.length && lengths[0] === 0) {
      lengths = lengths.slice(1)
      start++
    }
    while (lengths.length && lengths.at(-1) === 0) lengths = lengths.slice(0, -1)

    group.books.push({ id: s.title, en: s.title, he: s.heTitle, start, lengths })
    books[s.title] = { corpus: corpus.id, talmud: !!corpus.talmud, start, count: lengths.length }
  }
  catalog[corpus.id] = groups
  console.log(`${corpus.id}: ${groups.reduce((n, g) => n + g.books.length, 0)} books`)
}

await writeFile('frontend/src/apps/learning/catalog.json', JSON.stringify(catalog) + '\n')
await writeFile('backend/internal/learning/books.json', JSON.stringify(books, null, 1) + '\n')
