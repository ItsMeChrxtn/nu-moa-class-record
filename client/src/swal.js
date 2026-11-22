// SweetAlert2, styled for NU MOA (see theme-pro.css, ".swal2-*").
// - notify(): results. Success / info slide in as a toast in the corner with a timer bar;
//   errors and warnings open a centred popup that waits for OK (so they cannot be missed).
// - ask(): confirmations (delete, log out, …). Can require typing a word first.
// Popups run one at a time in order, so a result never closes an open confirmation.
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const TITLES = { success: 'Done!', error: 'Something went wrong', info: 'Heads up', warning: 'Please check' };
const TOAST_MS = { success: 2600, info: 5000 };
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const base = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  focusCancel: false,
  customClass: {
    popup: 'nu-swal',
    title: 'nu-swal-title',
    htmlContainer: 'nu-swal-text',
    actions: 'nu-swal-actions',
    confirmButton: 'btn primary nu-swal-btn',
    cancelButton: 'btn nu-swal-btn',
    denyButton: 'btn nu-swal-btn',
    input: 'nu-swal-input',
    inputLabel: 'nu-swal-label',
    validationMessage: 'nu-swal-validation',
  },
  showClass: { popup: reduced() ? '' : 'nu-swal-in', backdrop: 'swal2-backdrop-show' },
  hideClass: { popup: reduced() ? '' : 'nu-swal-out', backdrop: 'swal2-backdrop-hide' },
});

const toaster = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timerProgressBar: true,
  customClass: { popup: 'nu-toast', title: 'nu-toast-title', htmlContainer: 'nu-toast-text', closeButton: 'nu-toast-x', timerProgressBar: 'nu-toast-bar' },
  showClass: { popup: reduced() ? '' : 'nu-toast-in' },
  hideClass: { popup: reduced() ? '' : 'nu-toast-out' },
  didOpen: (el) => {
    el.addEventListener('mouseenter', Swal.stopTimer);
    el.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

// Popups wait for each other; a toast does not hold up the next popup.
let queue = Promise.resolve();
const enqueue = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const asHtml = (s) => esc(s).replace(/\n/g, '<br>');

export function notify(message, type = 'success', title) {
  const head = title || TITLES[type] || 'Notice';
  const text = message && message !== head ? message : '';
  if (type === 'success' || type === 'info') {
    return enqueue(() => {
      toaster.fire({ icon: type, title: head, html: text ? asHtml(text) : undefined, timer: TOAST_MS[type] });
    });
  }
  return enqueue(() =>
    base.fire({
      icon: type === 'warning' ? 'warning' : 'error',
      title: head,
      html: text ? asHtml(text) : undefined,
      confirmButtonText: 'OK',
      customClass: { popup: `nu-swal nu-swal-${type}`, confirmButton: 'btn primary nu-swal-btn', actions: 'nu-swal-actions', title: 'nu-swal-title', htmlContainer: 'nu-swal-text' },
    })
  );
}

// opts: { title, message, confirmLabel, danger, requireText }
export function ask(opts) {
  return enqueue(async () => {
    const need = opts.requireText;
    const res = await base.fire({
      icon: opts.danger ? 'warning' : 'question',
      title: opts.title || 'Continue?',
      html: opts.message ? asHtml(opts.message) : undefined,
      showCancelButton: true,
      confirmButtonText: opts.confirmLabel || 'Continue',
      cancelButtonText: 'Cancel',
      focusConfirm: !need,
      input: need ? 'text' : undefined,
      inputLabel: need ? `Type ${need} to confirm` : undefined,
      inputAttributes: need ? { autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' } : undefined,
      inputValidator: need ? (v) => (v.trim().toUpperCase() === need.toUpperCase() ? undefined : `Type ${need} exactly to continue.`) : undefined,
      customClass: {
        popup: `nu-swal ${opts.danger ? 'nu-swal-danger' : ''}`,
        title: 'nu-swal-title',
        htmlContainer: 'nu-swal-text',
        actions: 'nu-swal-actions',
        confirmButton: `btn ${opts.danger ? 'danger' : 'primary'} nu-swal-btn`,
        cancelButton: 'btn nu-swal-btn',
        input: 'nu-swal-input',
        inputLabel: 'nu-swal-label',
        validationMessage: 'nu-swal-validation',
      },
    });
    return res.isConfirmed;
  });
}
