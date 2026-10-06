import { errMessage, UserError } from './errors';

const UNSUPPORTED = /NotImplemented|not (been )?implemented|UnknownOperation|unknown operation|InvalidAction|UnsupportedOperation|not supported|unsupported|no handler|501/i;

/** True when an error means "this emulator does not implement the operation". */
export const isUnsupported = (e: unknown) => UNSUPPORTED.test(errMessage(e));

/**
 * Run an SDK call; when LocalEmu reports the operation as unsupported, throw a UserError that says
 * so plainly (shown in the page's error alert) instead of surfacing a raw protocol error.
 */
export async function guard<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isUnsupported(e)) throw new UserError(`LocalEmu does not support ${what} (${errMessage(e)}).`);
    throw e;
  }
}
