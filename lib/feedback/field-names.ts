/**
 * Form field names shared by the client form and the server-side anti-spam
 * checks.
 *
 * Separate from `antispam.ts` on purpose: that module is `server-only` and
 * pulls in `node:crypto`, so a client component cannot import it. Two hand-kept
 * copies of these strings would silently disable the honeypot the first time
 * one of them was renamed.
 */

/** The hidden field. Named to look worth filling in to a naive bot. */
export const HONEYPOT_FIELD = 'website';

/** The signed render timestamp, used for the time-trap. */
export const FORM_TOKEN_FIELD = 'rendered';
