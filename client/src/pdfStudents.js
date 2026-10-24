import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { itemsToLines, parseSectionInfo, parseStudentLines } from './studentParser.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Reads the PDF in the browser; nothing is uploaded.
// Returns the class list plus whatever section details the first page's header has.
export async function studentsFromPdf(file) {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const lines = [];
  let info = {};
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    if (p === 1) info = parseSectionInfo(items);
    lines.push(...itemsToLines(items));
  }
  await doc.destroy();
  const { students, sectionCode } = parseStudentLines(lines);
  if (!info.code && sectionCode) info.code = sectionCode;
  return { students, info };
}
