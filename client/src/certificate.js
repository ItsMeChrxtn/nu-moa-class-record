// Midterm / final grade certificate (PDF), made in the browser from the student's own record.
import { COMPONENTS, termOf } from './api.js';
import { splitName, titleCase } from './ui.jsx';

const NAME = Object.fromEntries(COMPONENTS.map((c) => [c.key, c.name]));
const NAVY = [15, 23, 42];
const BLUE = [29, 78, 216];
const GREY = [100, 116, 139];
const LINE = [203, 210, 220];

// Same rules as the grade itself: midterm = CP/EA of Midterms + MPT; final = CP/EA of both terms + MPT + CPT + bonus.
function breakdown(record, term) {
  const { items, scores, section, bonus } = record;
  const w = (term === 'MID' ? section.weights?.midterm : section.weights?.final) || {};
  const pick = (c) => items.filter((i) => i.component === c && (term === 'POST' || c === 'MPT' || termOf(i) === 'MID'));
  const rows = (term === 'MID' ? ['CP', 'EA', 'MPT'] : ['CP', 'EA', 'MPT', 'CPT']).map((c) => {
    const list = pick(c);
    const got = list.reduce((s, i) => s + (scores[i.id] ?? 0), 0);
    const max = list.reduce((s, i) => s + i.max, 0);
    const weight = Number(w[c]) || 0;
    return { label: `${c} · ${NAME[c]}${term === 'POST' && (c === 'CP' || c === 'EA') ? ' (both terms)' : ''}`, got, max, weight, points: max ? (got / max) * weight : 0, items: list.length };
  });
  if (term === 'POST' && bonus) rows.push({ label: 'Bonus', got: null, max: null, weight: null, points: bonus });
  return rows;
}

const fmt = (n, d = 2) => (n == null ? '—' : Number(n).toFixed(d));

export async function downloadCertificate(record, student, term) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const cx = W / 2;
  const { section } = record;
  const grade = term === 'MID' ? record.grades.midterm : record.grades.final;
  const { first, last } = splitName(student.name);
  const fullName = `${first} ${last}`.trim().toUpperCase();
  const issued = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const termWord = term === 'MID' ? 'Midterm' : 'Final';
  const passFail = grade.equivalent === 'Pass' || grade.equivalent === 'Repeat';

  // Frame: navy outer border, thin inner rule, blue corner marks.
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.6);
  doc.rect(9, 9, W - 18, H - 18);
  doc.setLineWidth(0.3);
  doc.rect(13, 13, W - 26, H - 26);
  doc.setFillColor(...BLUE);
  for (const [x, y] of [[13, 13], [W - 23, 13], [13, H - 23], [W - 23, H - 23]]) doc.rect(x, y, 10, 1.4, 'F');
  // Brand mark (the app's folded square).
  doc.setFillColor(...BLUE);
  doc.lines([[8, 0], [0, 4.96], [-3.04, 3.04], [-4.96, 0]], cx - 4, 21, [1, 1], 'F', true);

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('NATIONAL UNIVERSITY · MOA', cx, 36, { align: 'center', charSpace: 1.2 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text('ONLINE CLASS RECORD', cx, 41, { align: 'center', charSpace: 1 });

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(`CERTIFICATE OF ${termWord.toUpperCase()} GRADE`, cx, 55, { align: 'center', charSpace: 0.6 });
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.8);
  doc.line(cx - 22, 59, cx + 22, 59);

  doc.setFont('times', 'italic');
  doc.setFontSize(13);
  doc.setTextColor(...GREY);
  doc.text('This is to certify that', cx, 69, { align: 'center' });
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...NAVY);
  doc.text(fullName, cx, 81, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GREY);
  doc.text(`Student No. ${student.username}`, cx, 87, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(12.5);
  doc.text(`obtained the following ${termWord.toLowerCase()} grade in`, cx, 96, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text([section.subjectCode, section.subjectTitle && titleCase(section.subjectTitle)].filter(Boolean).join(' · ') || section.code, cx, 103, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GREY);
  doc.text([`Section ${section.code}`, section.term, section.academicYear && `A.Y. ${section.academicYear}`].filter(Boolean).join('  ·  '), cx, 109, { align: 'center' });

  // Left: the grade. Right: how it was computed.
  const top = 117;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(28, top, 74, 52, 3, 3, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(`${termWord.toUpperCase()} GRADE`, 65, top + 9, { align: 'center', charSpace: 0.8 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...NAVY);
  doc.text(`${fmt(grade.percent)}%`, 65, top + 25, { align: 'center' });
  const fail = grade.equivalent === 'R' || grade.equivalent === 'Repeat';
  doc.setFillColor(...(fail ? [190, 18, 60] : BLUE));
  doc.roundedRect(42, top + 32, 46, 11, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(passFail ? grade.equivalent.toUpperCase() : `GRADE POINT ${grade.equivalent ?? '—'}`, 65, top + 39.5, { align: 'center' });

  const rows = breakdown(record, term);
  const tx = 112;
  const tw = W - 28 - tx;
  const col = { comp: tx + 3, score: tx + tw * 0.62, weight: tx + tw * 0.79, points: tx + tw - 3 };
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GREY);
  doc.text('COMPONENT', col.comp, top + 4);
  doc.text('SCORE', col.score, top + 4, { align: 'right' });
  doc.text('WEIGHT', col.weight, top + 4, { align: 'right' });
  doc.text('POINTS', col.points, top + 4, { align: 'right' });
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(tx, top + 6.5, tx + tw, top + 6.5);
  let y = top + 13;
  doc.setFontSize(9);
  for (const r of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...NAVY);
    doc.text(r.label, col.comp, y);
    doc.setFont('courier', 'normal');
    doc.text(r.max == null ? '' : r.max ? `${fmt(r.got, r.got % 1 ? 2 : 0)} / ${r.max}` : 'no items', col.score, y, { align: 'right' });
    doc.text(r.weight == null ? '' : `${r.weight}%`, col.weight, y, { align: 'right' });
    doc.setFont('courier', 'bold');
    doc.text(`${r.label === 'Bonus' ? '+' : ''}${fmt(r.points)}`, col.points, y, { align: 'right' });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(tx, y + 3, tx + tw, y + 3);
    y += 8;
  }
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(tx, y - 3.5, tx + tw, y - 3.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(`${termWord} grade`, col.comp, y + 2);
  doc.setFont('courier', 'bold');
  doc.text(`${fmt(grade.percent)}%`, col.points, y + 2, { align: 'right' });

  // Signature line and footer.
  const sy = 179;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(32, sy, 112, sy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(section.faculty ? titleCase(section.faculty) : '—', 72, sy - 2.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('Faculty-in-charge', 72, sy + 4.5, { align: 'center' });
  doc.line(W - 112, sy, W - 32, sy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(issued, W - 72, sy - 2.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('Date issued', W - 72, sy + 4.5, { align: 'center' });
  doc.setFontSize(7);
  doc.text('Generated from the NU MOA Online Class Record for the student\'s reference. This is not an official transcript of records.', cx, H - 17.5, { align: 'center' });

  doc.save(`${termWord} Grade Certificate - ${section.code} - ${student.username}.pdf`);
}
