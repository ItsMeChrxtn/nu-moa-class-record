import { useRef, useState } from 'react';
import { api, rowsFromText } from './api.js';
import { ScheduleEditor, blankRow, filledRows } from './SectionForm.jsx';
import { EMAIL, isStudentNo } from './studentParser.js';
import { Avatar, Icon, Modal } from './ui.jsx';

// PDF drop zone + editable preview of the class list before anything is saved.
export function StudentImporter({ students, setStudents, onDetails }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [manual, setManual] = useState({ studentNo: '', name: '', course: '', email: '' });

  async function readFiles(files) {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (!pdfs.length) return setError('Only PDF files are supported.');
    setBusy(true);
    setError('');
    try {
      // Loaded on demand so pdf.js only downloads when a PDF is actually picked.
      const { studentsFromPdf } = await import('./pdfStudents.js');
      let total = 0;
      let merged = students;
      for (const f of pdfs) {
        const { students: found, info } = await studentsFromPdf(f);
        total += found.length;
        if (Object.keys(info).length) onDetails?.(info, f.name);
        const have = new Set(merged.map((s) => s.studentNo));
        merged = [...merged, ...found.filter((s) => !have.has(s.studentNo))];
      }
      setStudents(merged);
      setFileInfo({ name: pdfs.map((f) => f.name).join(', '), total });
      if (!total) setError('No students were found in the PDF. Make sure the list has student numbers and names in "LAST, FIRST" format, or add students manually below.');
    } catch (e) {
      setError(`Could not read the PDF: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function addManual(e) {
    e.preventDefault();
    const s = {
      studentNo: manual.studentNo.trim(),
      name: manual.name.trim().toUpperCase(),
      course: manual.course.trim().toUpperCase(),
      email: manual.email.trim().toLowerCase(),
    };
    if (!isStudentNo(s.studentNo)) return setError('Invalid student number format (e.g. 2023-150144).');
    if (!s.name) return setError('Enter the student name.');
    if (s.email && !new RegExp(`^${EMAIL.source}$`).test(s.email)) return setError('That email address does not look right.');
    if (students.some((x) => x.studentNo === s.studentNo)) return setError('That student number is already on the list.');
    setError('');
    setStudents([...students, s].sort((a, b) => a.name.localeCompare(b.name)));
    setManual({ studentNo: '', name: '', course: '', email: '' });
  }
  const withEmail = students.filter((s) => s.email).length;

  return (
    <div className="importer">
      <div
        className={`dropzone ${drag ? 'drag' : ''} ${busy ? 'busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); readFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { readFiles(e.target.files); e.target.value = ''; }} />
        <span className="dz-icon">{busy ? <span className="spinner" /> : <Icon name="upload" size={22} />}</span>
        <div>
          <strong>{busy ? 'Reading PDF…' : 'Drop the class list (PDF) here'}</strong>
          <span>{fileInfo ? `${fileInfo.name} · ${fileInfo.total} found` : 'or click to choose a file. It is read in your browser only.'}</span>
        </div>
      </div>

      {error && <div className="alert error"><Icon name="alert" />{error}</div>}

      <div className="roster">
        <div className="roster-head">
          <strong>
            Students <span className="count-badge">{students.length}</span>
            {students.length > 0 && <span className="roster-emails">{withEmail} with email</span>}
          </strong>
          {students.length > 0 && (
            <button type="button" className="link-btn" onClick={() => { setStudents([]); setFileInfo(null); }}>
              Clear all
            </button>
          )}
        </div>
        <div className="roster-list">
          {students.length === 0 && <div className="roster-empty">No students yet. Import a PDF or add them manually.</div>}
          {students.map((s, i) => (
            <div key={s.studentNo} className="roster-row">
              <span className="row-index">{i + 1}</span>
              <Avatar name={s.name} size={28} />
              <div className="roster-info">
                <strong>{s.name}</strong>
                <span>{s.studentNo}{s.course && ` · ${s.course}`}</span>
                {s.email && <span className="roster-email">{s.email}</span>}
              </div>
              <button type="button" className="icon-btn danger" title="Remove" onClick={() => setStudents(students.filter((x) => x !== s))}>
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="roster-add">
          <input placeholder="Student No." value={manual.studentNo} onChange={(e) => setManual({ ...manual, studentNo: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addManual(e)} />
          <input placeholder="LAST, FIRST NAME" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addManual(e)} />
          <input placeholder="Course" value={manual.course} onChange={(e) => setManual({ ...manual, course: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addManual(e)} />
          <input type="email" placeholder="Email (optional)" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addManual(e)} />
          <button type="button" className="btn" onClick={addManual} title="Add student"><Icon name="plus" size={16} /></button>
        </div>
      </div>
    </div>
  );
}

// Asks for the section code to be typed, then deletes. Resolves true when deleted.
export async function deleteSection(section, { confirm, toast }, counts = {}) {
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const what = [counts.students != null && n(counts.students, 'enrolled student', 'enrolled students'), counts.items != null && n(counts.items, 'graded item', 'graded items')]
    .filter(Boolean)
    .join(' and ');
  const ok = await confirm({
    title: `Delete ${section.code}?`,
    message: `This permanently deletes ${section.code}${what ? ` with its ${what}` : ''} and every score in it. Student accounts are kept. This cannot be undone.`,
    confirmLabel: 'Delete section',
    danger: true,
    requireText: section.code,
  });
  if (!ok) return false;
  try {
    await api(`/faculty/sections/${section.id}`, { method: 'DELETE' });
    toast(`Deleted ${section.code}`);
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

const blank = { code: '', subjectCode: '', subjectTitle: '', units: '3', term: '', academicYear: '', copyFrom: '' };

export function NewSectionModal({ sections, onClose, onCreated }) {
  const latest = sections[0];
  const [form, setForm] = useState({ ...blank, term: latest?.term || '', academicYear: latest?.academicYear || '' });
  const [rows, setRows] = useState([blankRow()]);
  const [rowsTouched, setRowsTouched] = useState(false);
  const [students, setStudents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Fields the faculty typed in are never overwritten by PDF details.
  const [touched, setTouched] = useState(() => new Set());
  const [filled, setFilled] = useState(null); // { file, keys }
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setTouched((t) => new Set(t).add(k));
  };
  const auto = (k) => (filled?.keys.includes(k) ? 'autofilled' : undefined);

  function applyDetails(info, file) {
    const keys = Object.keys(info).filter((k) => k in blank && !touched.has(k) && info[k]);
    // Day / time / room from the PDF become schedule rows, unless the faculty already edited them.
    const pdfRows = rowsFromText(info).filter((r) => r.day || r.start);
    const useRows = pdfRows.length > 0 && !rowsTouched;
    if (!keys.length && !useRows) return;
    setForm((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, info[k]])) }));
    if (useRows) setRows(pdfRows);
    setFilled({ file, keys: useRows ? [...keys, 'schedule'] : keys });
  }

  function pickTemplate(e) {
    const src = sections.find((s) => s.id === e.target.value);
    setForm((f) => ({
      ...f,
      copyFrom: e.target.value,
      ...(src && {
        subjectCode: f.subjectCode || src.subjectCode || '',
        subjectTitle: f.subjectTitle || src.subjectTitle || '',
        units: f.units || String(src.units ?? ''),
      }),
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api('/faculty/sections', { method: 'POST', body: { ...form, schedule: filledRows(rows) } });
      let result = null;
      if (students.length) {
        const d = await api(`/faculty/sections/${created.section.id}/students`, { method: 'POST', body: { students } });
        result = d.result;
      }
      onCreated(created.section, result);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New Section"
      subtitle="Upload the master list (PDF). The section details and students are filled in for you to review."
      icon="layers"
      onClose={onClose}
      width={980}
      footer={
        <>
          <span className="foot-note muted small">{students.length ? `${students.length} students will be enrolled` : 'You can add students later'}</span>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="new-section" disabled={busy}>
            <Icon name="check" size={16} />
            {busy ? 'Creating…' : 'Create section'}
          </button>
        </>
      }
    >
      <form id="new-section" className="split" onSubmit={submit}>
        <div className="split-col">
          <h4 className="col-title"><span>1</span> Master list</h4>
          <StudentImporter students={students} setStudents={setStudents} onDetails={applyDetails} />
        </div>
        <div className="split-col">
          <h4 className="col-title"><span>2</span> Section details</h4>
          {filled && (
            <div className="alert info">
              <Icon name="check" />
              <span>Filled {filled.keys.length} fields from <strong>{filled.file}</strong>. Please review the highlighted fields.</span>
            </div>
          )}
          <div className="row-2">
            <label className="field">
              <span>Section code *</span>
              <input className={auto('code')} value={form.code} onChange={set('code')} placeholder="INF240" required />
            </label>
            <label className="field">
              <span>Subject code</span>
              <input className={auto('subjectCode')} value={form.subjectCode} onChange={set('subjectCode')} placeholder="CTADWEBL" />
            </label>
          </div>
          <label className="field">
            <span>Subject title</span>
            <input className={auto('subjectTitle')} value={form.subjectTitle} onChange={set('subjectTitle')} placeholder="Advanced Web Programming" />
          </label>
          <div className="field">
            <span className="field-label">Schedule <span className="hint">(add a row for each meeting)</span></span>
            <ScheduleEditor
              rows={rows}
              highlighted={filled?.keys.includes('schedule')}
              onChange={(r) => {
                setRows(r);
                setRowsTouched(true);
              }}
            />
          </div>
          <div className="row-3">
            <label className="field">
              <span>Term</span>
              <input className={auto('term')} value={form.term} onChange={set('term')} placeholder="First Term" />
            </label>
            <label className="field">
              <span>Units</span>
              <input className={auto('units')} type="number" min="0" max="10" value={form.units} onChange={set('units')} />
            </label>
            <label className="field">
              <span>A.Y.</span>
              <input className={auto('academicYear')} value={form.academicYear} onChange={set('academicYear')} placeholder="2026-2027" />
            </label>
          </div>
          <label className="field">
            <span>Copy items and percentages from <span className="hint">(optional)</span></span>
            <select value={form.copyFrom} onChange={pickTemplate}>
              <option value="">None, start empty</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.subjectTitle} ({s.itemCount} items)</option>
              ))}
            </select>
          </label>
          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
        </div>
      </form>
    </Modal>
  );
}

export function AddStudentsModal({ section, onClose, onDone }) {
  const [students, setStudents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const d = await api(`/faculty/sections/${section.id}/students`, { method: 'POST', body: { students } });
      onDone(d);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Add students to ${section.code}`}
      subtitle="Students who are already enrolled are skipped and their scores are kept."
      icon="users"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !students.length} onClick={submit}>
            <Icon name="check" size={16} />
            {busy ? 'Enrolling…' : `Enroll ${students.length} students`}
          </button>
        </>
      }
    >
      <StudentImporter students={students} setStudents={setStudents} />
      {error && <div className="alert error"><Icon name="alert" />{error}</div>}
    </Modal>
  );
}

export function ImportResultModal({ sectionCode, result, onClose, onSendAccounts }) {
  return (
    <Modal
      title="Enrollment complete"
      subtitle={sectionCode}
      icon="check"
      tone="high"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>Later</button>
          {onSendAccounts && (
            <button className="btn primary" onClick={onSendAccounts}>
              <Icon name="mail" size={16} /> Send student accounts
            </button>
          )}
        </>
      }
    >
      <div className="result-stats">
        <div><strong>{result.added}</strong><span>newly enrolled</span></div>
        <div><strong>{result.already}</strong><span>already enrolled</span></div>
        <div><strong>{result.emails || 0}</strong><span>with email</span></div>
      </div>
      {result.skipped?.length > 0 && (
        <div className="alert info"><Icon name="info" />Skipped ({result.skipped.length}): {result.skipped.join(', ')}</div>
      )}
      <div className="alert info">
        <Icon name="mail" />
        <span>
          <strong>Next:</strong> send the students their accounts. Each student gets their student number and a temporary password by
          email. You can also do this later with <strong>Student accounts</strong> on the section page.
        </span>
      </div>
    </Modal>
  );
}
