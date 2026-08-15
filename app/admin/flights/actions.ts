'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assertSameOrigin, requireAdmin } from '@/lib/admin/auth';
import {
  addFlight,
  clearFlightEdit,
  EditRejectedError,
  saveFlightEdit,
  setFlightRemoved,
  type EditInput,
  type EditTarget,
} from '@/lib/flights/edits';
import type { FlightKind } from '@/lib/flights/types';

/**
 * Correcting the board.
 *
 * The same shape as every other action in the panel: `requireAdmin`, then
 * `assertSameOrigin`, then the write, then revalidate the two public pages that
 * read the schedule, then redirect. Plain forms and real navigations, so the
 * screen works with scripting off like the rest of the panel.
 *
 * Outcomes travel in the query string rather than in returned state, because
 * these are `<form action>` posts rather than `useActionState` forms — a page
 * of a dozen rows would otherwise need a dozen independent pending states, and
 * none of it would survive JavaScript being off.
 */

function revalidatePublicBoard(): void {
  revalidatePath('/[locale]/flights', 'page');
  revalidatePath('/[locale]', 'page');
}

function readTarget(formData: FormData): EditTarget | null {
  const date = formData.get('date');
  const kind = formData.get('kind');
  const flightNoNorm = formData.get('flightNoNorm');

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (kind !== 'arrival' && kind !== 'departure') return null;
  if (typeof flightNoNorm !== 'string' || flightNoNorm.trim() === '') return null;

  return { date, kind: kind as FlightKind, flightNoNorm: flightNoNorm.trim() };
}

/**
 * Every box the row form offers.
 *
 * Read as a whole, always. The form submits all of them, so what arrives is the
 * complete state of the correction — which is what makes emptying a box mean
 * "drop this override" rather than "leave it alone".
 */
function readInput(formData: FormData): EditInput {
  const text = (name: string) => {
    const value = formData.get(name);
    // Capped where it is free text a human types: a note is a line on a flight
    // board, not a document.
    return typeof value === 'string' ? value.slice(0, 200) : '';
  };

  return {
    flightNo: text('flightNo'),
    city: text('city'),
    scheduledTime: text('scheduledTime'),
    actualTime: text('actualTime'),
    aircraft: text('aircraft'),
    traffic: text('traffic'),
    note: text('note'),
  };
}

/** Where to send the browser back to, with a word about what happened. */
function backTo(date: string, outcome: string, extra: Record<string, string> = {}): never {
  const params = new URLSearchParams({ date, ...extra, saved: outcome });
  redirect(`/admin/flights?${params.toString()}`);
}

export async function saveFlightEditAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const target = readTarget(formData);
  if (!target) redirect('/admin/flights?saved=unknown');

  try {
    saveFlightEdit(target, readInput(formData));
  } catch (error) {
    if (error instanceof EditRejectedError) {
      // The row comes back marked, with what was typed still in the boxes —
      // the form is server-rendered from the request, so nothing is lost.
      backTo(target.date, 'invalid', { field: error.field, flight: target.flightNoNorm });
    }
    throw error;
  }

  revalidatePublicBoard();
  backTo(target.date, 'edited', { flight: target.flightNoNorm });
}

export async function addFlightAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const date = formData.get('date');
  const kind = formData.get('kind');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    redirect('/admin/flights?saved=unknown');
  }
  if (kind !== 'arrival' && kind !== 'departure') backTo(date, 'unknown');

  let added: { flightNoNorm: string };
  try {
    added = addFlight(date, kind as FlightKind, readInput(formData));
  } catch (error) {
    if (error instanceof EditRejectedError) {
      backTo(date, 'invalidNew', { field: error.field });
    }
    throw error;
  }

  revalidatePublicBoard();
  backTo(date, 'added', { flight: added.flightNoNorm });
}

/** Takes a flight off the board, or puts it back. Reversible either way. */
export async function setFlightRemovedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const target = readTarget(formData);
  if (!target) redirect('/admin/flights?saved=unknown');

  const removed = formData.get('removed') === 'true';
  setFlightRemoved(target, removed);

  revalidatePublicBoard();
  backTo(target.date, removed ? 'removed' : 'restored', { flight: target.flightNoNorm });
}

/** Throws the correction away so the workbook's own values come back. */
export async function clearFlightEditAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await assertSameOrigin();

  const target = readTarget(formData);
  if (!target) redirect('/admin/flights?saved=unknown');

  clearFlightEdit(target);

  revalidatePublicBoard();
  backTo(target.date, 'reverted', { flight: target.flightNoNorm });
}
