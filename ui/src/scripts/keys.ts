/** Global keyboard shortcuts (? help, g-then-key navigation) and dialog focus handling. */
import { $, isTyping } from './util';

const GO: Record<string, string> = { h: '/', s: '/services', a: '/activity', '3': '/s3', q: '/sqs', d: '/dynamodb', l: '/lambda', e: '/ec2', i: '/iam', n: '/sns', k: '/kms', c: '/cloudformation' };

export function initKeys() {
  const help = $<HTMLDialogElement>('#shortcuts-dialog');
  let chord = 0;
  const openHelp = () => { if (help && !help.open) { openers.set(help, document.activeElement as HTMLElement | null); help.showModal(); } };
  document.querySelectorAll('[data-shortcuts-open]').forEach((b) => b.addEventListener('click', openHelp));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping() || document.querySelector('dialog[open]')) return;
    if (e.key === '?') { e.preventDefault(); openHelp(); return; }
    if (chord && Date.now() < chord) {
      chord = 0;
      const to = GO[e.key.toLowerCase()];
      if (to) { e.preventDefault(); location.href = to; }
      return;
    }
    if (e.key === 'g') chord = Date.now() + 1200;
  });

  // Dialogs: remember the opener and give focus back when they close (showModal already traps focus).
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach((d) => {
    d.addEventListener('close', () => { const o = openers.get(d); if (o && document.contains(o)) o.focus(); });
  });
}

export const openers = new WeakMap<HTMLDialogElement, HTMLElement | null>();
