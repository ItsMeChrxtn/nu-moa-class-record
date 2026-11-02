// Splits a person's name into surname and given names, keeping multi-word surnames whole.
// Works for "DEL ROSARIO, CHRISTIAN LLOYD E." and "Christian Lloyd E. Del Rosario" alike:
//   - with a comma, the surname is everything before it;
//   - otherwise the surname is everything after the middle initial ("E."), or, without one, the last
//     word together with any particles in front of it (Del, Dela, De La, Delos, San, Sta., Van …).
const PARTICLES = new Set(['de', 'del', 'dela', 'la', 'las', 'los', 'delos', 'de los', 'di', 'da', 'das', 'do', 'dos', 'san', 'sta', 'sta.', 'santa', 'santo', 'sto', 'sto.', 'van', 'von', 'der', 'den', 'le', 'mac', 'mc', 'y']);
const INITIAL = /^[A-Za-zÑñ]\.?$/;

export function splitPersonName(name = '') {
  const clean = String(name).replace(/\s+/g, ' ').trim();
  if (!clean) return { surname: '', given: '' };
  if (clean.includes(',')) {
    const i = clean.indexOf(',');
    return { surname: clean.slice(0, i).trim(), given: clean.slice(i + 1).trim() };
  }
  const words = clean.split(' ');
  if (words.length === 1) return { surname: words[0], given: '' };
  // After the last middle initial (not the very last word): "Christian Lloyd E. Del Rosario".
  for (let i = words.length - 2; i >= 1; i--) {
    if (INITIAL.test(words[i])) return { surname: words.slice(i + 1).join(' '), given: words.slice(0, i + 1).join(' ') };
  }
  // Otherwise the last word plus the particles before it: "Juan Dela Cruz", "Maria De La Paz".
  let start = words.length - 1;
  while (start > 1 && PARTICLES.has(words[start - 1].toLowerCase())) start--;
  return { surname: words.slice(start).join(' '), given: words.slice(0, start).join(' ') };
}

export const surnameOf = (name) => splitPersonName(name).surname;
// "SURNAME, GIVEN NAMES" — the order the school's forms print.
export const surnameFirst = (name) => {
  const { surname, given } = splitPersonName(name);
  return given ? `${surname}, ${given}` : surname;
};
