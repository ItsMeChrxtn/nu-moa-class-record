import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Temp passwords are also written to server/credentials/ (same CSV format as the Excel import),
// so a password shown once in the browser is never lost.
export function saveCredentials(label, rows) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../credentials');
  fs.mkdirSync(dir, { recursive: true });
  const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [label, r.username ?? r.studentNo, r.name, r.tempPassword].map(csv).join(','));
  const safe = String(label).replace(/[^A-Za-z0-9_-]/g, '_');
  fs.writeFileSync(
    path.join(dir, `initial-passwords-${safe}-${Date.now()}.csv`),
    ['Section,Username,Name,TempPassword', ...lines].join('\n')
  );
}
