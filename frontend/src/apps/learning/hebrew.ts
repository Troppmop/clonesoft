const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const hundreds = ['', 'ק', 'ר', 'ש', 'ת']

/** Writes n (1–999) as a Hebrew numeral with geresh or gershayim: 1 → א׳, 15 → ט״ו, 119 → קי״ט. */
export function hebrewNumeral(n: number): string {
  if (n < 1 || n > 999 || !Number.isInteger(n)) return String(n)
  let letters = ''
  let h = Math.floor(n / 100)
  while (h > 4) {
    letters += 'ת'
    h -= 4
  }
  letters += hundreds[h]
  const rest = n % 100
  // 15 and 16 are written ט״ו and ט״ז to avoid spelling the divine name
  if (rest === 15) letters += 'טו'
  else if (rest === 16) letters += 'טז'
  else letters += tens[Math.floor(rest / 10)] + ones[rest % 10]
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`
}

// Cantillation marks (U+0591–U+05AF), plus meteg and paseq, which belong to the same system
const cantillation = /[֑-ֽ֯׀]/g
// Vowel points, dagesh, rafe, shin and sin dots, and qamats qatan
const vowels = /[ְ-ׇּֿׁׂׅׄ]/g

export function stripMarks(text: string, { vowels: keepVowels, cantillation: keepCantillation }: { vowels: boolean; cantillation: boolean }) {
  let out = text
  if (!keepCantillation) out = out.replace(cantillation, '').replace(/ {2,}/g, ' ')
  if (!keepVowels) out = out.replace(vowels, '')
  return out
}
