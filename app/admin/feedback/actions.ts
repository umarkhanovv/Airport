'use server';

import { revalidatePath } from 'next/cache';

import { assertSameOrigin, requireAdmin } from '@/lib/admin/auth';
import { setFeedbackRead } from '@/lib/feedback/store';

/** Marks one submission read or unread. */
export async function toggleFeedbackRead(formData: FormData): Promise<void> {
  await requireAdmin('/admin/feedback');
  await assertSameOrigin();

  const id = formData.get('id');
  const read = formData.get('read');
  if (typeof id !== 'string' || id === '') return;

  setFeedbackRead(id, read === 'true');
  revalidatePath('/admin/feedback');
}
