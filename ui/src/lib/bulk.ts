import { errMessage, UserError } from './errors';
import { plural } from './format';
import type { ActionResult } from './action';

export interface BulkOpts {
  /** Past tense verb, e.g. "Deleted". */
  verb: string;
  noun: string;
  nouns?: string;
  /** Extra sentence appended when everything worked. */
  tail?: string;
  /** What to ask the user to select when nothing is selected (defaults to noun). */
  pick?: string;
}

/**
 * Run `fn` over every selected id (never stops at the first error) and summarise:
 *   "Deleted 3 of 4 (1 failed: reason)"  - partial success, details listed in the flash
 *   all ok  -> "Deleted 4 functions."
 *   all bad -> UserError "Deleted 0 of 4 (4 failed: reason)"
 */
export async function bulk(ids: string[], o: BulkOpts, fn: (id: string) => Promise<unknown>, label: (id: string) => string = (x) => x): Promise<ActionResult> {
  if (!ids.length) throw new UserError(`Select at least one ${o.pick ?? o.noun}.`);
  const failed: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try { await fn(id); } catch (e) { failed.push({ id, reason: errMessage(e) }); }
  }
  const ok = ids.length - failed.length;
  if (!failed.length) return { message: `${o.verb} ${plural(ids.length, o.noun, o.nouns)}.${o.tail ? ' ' + o.tail : ''}` };
  const uniq = [...new Set(failed.map((x) => x.reason))];
  const short = uniq.slice(0, 2).map((r) => (r.length > 110 ? r.slice(0, 107) + '...' : r)).join('; ') + (uniq.length > 2 ? `; +${uniq.length - 2} more` : '');
  const msg = `${o.verb} ${ok} of ${ids.length} (${failed.length} failed: ${short})`;
  if (!ok) throw new UserError(msg);
  return { type: 'warning', message: msg, detail: failed.slice(0, 8).map((x) => `${label(x.id)}: ${x.reason}`).join('\n').slice(0, 900) };
}
