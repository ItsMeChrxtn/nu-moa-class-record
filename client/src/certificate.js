// Midterm / final grade certificate (PDF), made in the browser from the student's own record.
// Fonts (OFL, in public/cert-fonts): Great Vibes for the name, Playfair Display SC for headings,
// Crimson Text for the body. They load only when a certificate is downloaded.
import { displayName, splitName, titleCase } from './ui.jsx';

const NAVY = [27, 42, 107];
const NAVY_LIGHT = [58, 78, 156];
const GOLD = [184, 142, 47];
const GOLD_LIGHT = [222, 190, 112];
const CREAM = [251, 247, 236];
const INK = [55, 62, 92];
const FONTS = [
  ['GreatVibes-Regular.ttf', 'GreatVibes', 'normal'],
  ['PlayfairDisplaySC-Bold.ttf', 'PlayfairSC', 'bold'],
  ['PlayfairDisplaySC-Regular.ttf', 'PlayfairSC', 'normal'],
  ['CrimsonText-Regular.ttf', 'Crimson', 'normal'],
  ['CrimsonText-Italic.ttf', 'Crimson', 'italic'],
  ['CrimsonText-SemiBold.ttf', 'Crimson', 'bold'],
];

let fontData; // base64 per file, cached after the first download
async function loadFonts() {
  if (!fontData)
    fontData = Promise.all(
      FONTS.map(async ([file]) => {
        const res = await fetch(`/cert-fonts/${file}`);
        if (!res.ok) throw new Error(`Font ${file} could not be loaded`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      })
    ).catch((e) => {
      fontData = null;
      throw e;
    });
  return fontData;
}

const fmt = (n) => (n == null ? '—' : Number(n).toFixed(2));

export async function downloadCertificate(record, student, term) {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), loadFonts()]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  FONTS.forEach(([file, family, style], i) => {
    doc.addFileToVFS(file, fonts[i]);
    doc.addFont(file, family, style);
  });

  const W = 297;
  const H = 210;
  const cx = W / 2;
  const { section } = record;
  const grade = term === 'MID' ? record.grades.midterm : record.grades.final;
  const termWord = term === 'MID' ? 'Midterm' : 'Final';
  const { first, last } = splitName(student.name);
  const name = titleCase(`${first} ${last}`.trim());
  const passFail = grade.equivalent === 'Pass' || grade.equivalent === 'Repeat';
  const failed = grade.equivalent === 'R' || grade.equivalent === 'Repeat';
  const issued = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ---- drawing helpers (absolute points -> jsPDF relative segments) ----
  const path = (pts, style, closed = false) => {
    const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], style, closed);
  };
  const arc = (x, y, r, a0, a1, n = 24) => path(Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [x + r * Math.cos(a), y + r * Math.sin(a)];
  }), 'S');
  const diamond = (x, y, s) => path([[x, y - s], [x + s, y], [x, y + s], [x - s, y]], 'F', true);
  const opacity = (o) => doc.setGState(new doc.GState({ opacity: o, 'stroke-opacity': o }));
  // Letter-spaced text, centred by hand (jsPDF leaves the extra spacing out when it centres). Returns its width.
  const spaced = (text, y, cs) => {
    const w = doc.getTextWidth(text) + cs * (text.length - 1);
    doc.text(text, cx - w / 2, y, { charSpace: cs });
    return w;
  };
  const fit = (text, font, style, size, maxW) => {
    doc.setFont(font, style);
    let s = size;
    doc.setFontSize(s);
    while (s > 10 && doc.getTextWidth(text) > maxW) doc.setFontSize((s -= 1));
    return s;
  };

  // ---- navy border with a wave pattern ----
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(...NAVY_LIGHT);
  doc.setLineWidth(0.25);
  const wave = (horizontal, at, phase) => {
    const len = horizontal ? W : H;
    const pts = [];
    for (let t = 0; t <= len; t += 0.75) {
      const o = Math.sin((t / 6) * 2 * Math.PI + phase) * 1.3;
      pts.push(horizontal ? [t, at + o] : [at + o, t]);
    }
    path(pts, 'S');
  };
  for (const [h, at] of [[true, 5], [true, H - 5], [false, 5], [false, W - 5]]) {
    wave(h, at, 0);
    wave(h, at, Math.PI);
  }

  // ---- cream paper, gold double frame, corner ornaments ----
  doc.setFillColor(...CREAM);
  doc.rect(10, 10, W - 20, H - 20, 'F');
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.9);
  doc.rect(14, 14, W - 28, H - 28);
  doc.setLineWidth(0.3);
  doc.rect(16.5, 16.5, W - 33, H - 33);
  doc.setFillColor(...GOLD);
  for (const [x, y, sx, sy] of [[22, 22, 1, 1], [W - 22, 22, -1, 1], [22, H - 22, 1, -1], [W - 22, H - 22, -1, -1]]) {
    doc.setLineWidth(0.45);
    doc.line(x, y, x + 17 * sx, y);
    doc.line(x, y, x, y + 17 * sy);
    doc.setLineWidth(0.3);
    const start = sx > 0 ? (sy > 0 ? 0 : 270) : sy > 0 ? 90 : 180;
    arc(x, y, 7, start, start + 90);
    arc(x, y, 10.5, start, start + 90);
    diamond(x, y, 1.6);
    diamond(x + 17 * sx, y, 0.9);
    diamond(x, y + 17 * sy, 0.9);
  }

  // ---- guilloche rosette watermark ----
  opacity(0.16);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.18);
  const ry = 104;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    doc.circle(cx + 26 * Math.cos(a), ry + 26 * Math.sin(a), 30);
  }
  for (const r of [56, 58.5]) doc.circle(cx, ry, r);
  opacity(1);
  // a soft cream disc keeps the name readable over the rosette
  opacity(0.75);
  doc.setFillColor(...CREAM);
  doc.ellipse(cx, 95, 70, 13, 'F');
  opacity(1);

  // ---- heading ----
  doc.setTextColor(...NAVY);
  doc.setFont('PlayfairSC', 'bold');
  doc.setFontSize(50);
  spaced('CERTIFICATE', 50, 2.2);
  doc.setTextColor(...GOLD);
  doc.setFont('PlayfairSC', 'normal');
  doc.setFontSize(15);
  const sub = `OF ${termWord.toUpperCase()} GRADE`;
  const subW = spaced(sub, 61, 1.6);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(cx - subW / 2 - 38, 59.3, cx - subW / 2 - 6, 59.3);
  doc.line(cx + subW / 2 + 6, 59.3, cx + subW / 2 + 38, 59.3);
  doc.setFillColor(...GOLD);
  diamond(cx - subW / 2 - 39, 59.3, 1);
  diamond(cx + subW / 2 + 39, 59.3, 1);

  // ---- presented to ----
  doc.setTextColor(...INK);
  doc.setFont('Crimson', 'italic');
  doc.setFontSize(16);
  doc.text('This certificate is proudly presented to', cx, 76, { align: 'center' });
  doc.setTextColor(...NAVY);
  fit(name, 'GreatVibes', 'normal', 54, 215);
  doc.text(name, cx, 98, { align: 'center' });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.35);
  doc.line(cx - 92, 104, cx - 4, 104);
  doc.line(cx + 4, 104, cx + 92, 104);
  doc.setFillColor(...GOLD);
  diamond(cx, 104, 1.5);
  diamond(cx - 5.5, 104, 0.7);
  diamond(cx + 5.5, 104, 0.7);

  // ---- the grade ----
  doc.setTextColor(...INK);
  doc.setFont('Crimson', 'normal');
  doc.setFontSize(14);
  doc.text(`for earning a ${termWord.toLowerCase()} grade of`, cx, 114, { align: 'center' });
  doc.setTextColor(...NAVY);
  doc.setFont('PlayfairSC', 'bold');
  doc.setFontSize(22);
  const gradeText = passFail ? `${fmt(grade.percent)}%  ·  ${grade.equivalent.toUpperCase()}` : `${fmt(grade.percent)}%  ·  GRADE POINT ${grade.equivalent ?? '—'}`;
  doc.text(gradeText, cx, 124.5, { align: 'center' });

  // "in COURSE (CODE)" on one line, two fonts
  const course = `${(section.subjectTitle || section.code).toUpperCase()}${section.subjectCode ? ` (${section.subjectCode})` : ''}`;
  const courseSize = fit(course, 'PlayfairSC', 'bold', 17, 205);
  const courseW = doc.getTextWidth(course);
  doc.setFont('Crimson', 'normal');
  doc.setFontSize(14);
  const inW = doc.getTextWidth('in ');
  const x0 = cx - (inW + courseW) / 2;
  doc.setTextColor(...INK);
  doc.text('in ', x0, 135);
  doc.setFont('PlayfairSC', 'bold');
  doc.setFontSize(courseSize);
  doc.setTextColor(...NAVY);
  doc.text(course, x0 + inW, 135);

  doc.setTextColor(...GOLD);
  doc.setFont('Crimson', 'bold');
  doc.setFontSize(12.5);
  doc.text([`Section ${section.code}`, [section.term, section.academicYear && `A.Y. ${section.academicYear.replace('-', '–')}`].filter(Boolean).join(', ')].filter(Boolean).join('   •   '), cx, 143, { align: 'center' });

  doc.setTextColor(...INK);
  doc.setFont('Crimson', 'italic');
  doc.setFontSize(13.5);
  const message = failed
    ? ['Every term is a new chance to grow.', 'Keep going — the effort you give today builds tomorrow’s success.']
    : ['Congratulations on your hard work and dedication!', 'May this achievement inspire you to keep reaching for greater heights.'];
  doc.text(message, cx, 153, { align: 'center', lineHeightFactor: 1.25 });

  // ---- seal with ribbons ----
  const sy = 181;
  doc.setFillColor(...NAVY);
  path([[cx - 7, sy + 4], [cx - 2, sy + 6], [cx - 4.5, sy + 19], [cx - 7.5, sy + 15.5], [cx - 11, sy + 17.5]], 'F', true);
  path([[cx + 7, sy + 4], [cx + 2, sy + 6], [cx + 4.5, sy + 19], [cx + 7.5, sy + 15.5], [cx + 11, sy + 17.5]], 'F', true);
  doc.setFillColor(...GOLD);
  path(Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    const r = i % 2 ? 12.2 : 13.6;
    return [cx + r * Math.cos(a), sy + r * Math.sin(a)];
  }), 'F', true);
  doc.setFillColor(...GOLD_LIGHT);
  doc.circle(cx, sy, 11.3, 'F');
  doc.setFillColor(...NAVY);
  doc.circle(cx, sy, 9.8, 'F');
  doc.setDrawColor(...GOLD_LIGHT);
  doc.setLineWidth(0.3);
  doc.circle(cx, sy, 9.1);
  doc.circle(cx, sy, 5.3);
  doc.setFillColor(...GOLD_LIGHT);
  path(Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 1.75 : 4.1;
    return [cx + r * Math.cos(a), sy + 0.3 + r * Math.sin(a)];
  }), 'F', true);
  // text around the seal, letter by letter
  doc.setFont('PlayfairSC', 'bold');
  doc.setFontSize(4.3);
  doc.setTextColor(...GOLD_LIGHT);
  const ring = 'NU MOA · CLASS RECORD · ';
  [...ring].forEach((ch, i) => {
    const t = (i / ring.length) * 360;
    const a = ((t - 90) * Math.PI) / 180;
    doc.text(ch, cx + 7.2 * Math.cos(a), sy + 7.2 * Math.sin(a), { angle: -t, align: 'center', baseline: 'middle' });
  });

  // ---- signature lines ----
  const line = 181;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  for (const [x, top, bottom] of [[78, section.faculty ? displayName(section.faculty).toUpperCase() : '—', 'Faculty-in-charge'], [W - 78, issued.toUpperCase(), 'Date issued']]) {
    doc.line(x - 38, line, x + 38, line);
    doc.setTextColor(...NAVY);
    fit(top, 'PlayfairSC', 'bold', 11.5, 74);
    doc.text(top, x, line + 6, { align: 'center' });
    doc.setTextColor(...INK);
    doc.setFont('Crimson', 'italic');
    doc.setFontSize(11);
    doc.text(bottom, x, line + 11.5, { align: 'center' });
  }

  // Small print in the bottom border, on a plain navy band so the waves don't cross it.
  const note = `Student No. ${student.username}  ·  Generated from the NU MOA Online Class Record for the student’s reference  ·  Not an official transcript of records`;
  doc.setFont('Crimson', 'italic');
  doc.setFontSize(7);
  const nw = doc.getTextWidth(note);
  doc.setFillColor(...NAVY);
  doc.rect(cx - nw / 2 - 4, H - 8.6, nw + 8, 6.4, 'F');
  doc.setTextColor(214, 222, 245);
  doc.text(note, cx, H - 4.4, { align: 'center' });

  doc.save(`${termWord} Grade Certificate - ${section.code} - ${student.username}.pdf`);
}
