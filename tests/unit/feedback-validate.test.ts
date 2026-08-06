import { describe, expect, it } from 'vitest';

import { LIMITS } from '@/lib/feedback/types';
import { isFeedbackLocale, validateFeedback } from '@/lib/feedback/validate';

/**
 * Feedback validation (spec §9, plan §9.1).
 *
 * This is the boundary between an anonymous stranger and the airport's
 * database, so the length caps are asserted as hard limits rather than as
 * guidance.
 */

const valid = {
  name: 'Айгүл Серікова',
  email: 'aigul@example.kz',
  phone: '+7 701 000 00 00',
  subject: 'Lost property',
  message: 'I left a blue rucksack at the departures desk on Tuesday evening.',
  locale: 'kk',
};

describe('validateFeedback', () => {
  it('accepts a complete submission and trims it', () => {
    const result = validateFeedback({ ...valid, name: '  Айгүл   Серікова  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Айгүл Серікова');
    expect(result.value.locale).toBe('kk');
  });

  it('accepts a submission with only the required fields', () => {
    const result = validateFeedback({
      name: 'Pat',
      message: 'The departures board on the second floor is switched off.',
      locale: 'en',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBeNull();
    expect(result.value.phone).toBeNull();
    expect(result.value.subject).toBeNull();
  });

  it('reports every problem at once, not just the first', () => {
    const result = validateFeedback({
      name: '',
      email: 'not-an-address',
      message: '',
      locale: 'ru',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      name: 'required',
      email: 'invalidEmail',
      message: 'required',
    });
  });

  it('enforces the length caps', () => {
    const tooLongName = validateFeedback({
      ...valid,
      name: 'a'.repeat(LIMITS.name.max + 1),
    });
    expect(tooLongName.ok).toBe(false);
    if (!tooLongName.ok) expect(tooLongName.errors.name).toBe('tooLong');

    const tooLongMessage = validateFeedback({
      ...valid,
      message: 'a'.repeat(LIMITS.message.max + 1),
    });
    expect(tooLongMessage.ok).toBe(false);
    if (!tooLongMessage.ok) expect(tooLongMessage.errors.message).toBe('tooLong');

    // Exactly at the cap is allowed — an off-by-one here silently truncates
    // someone's complaint.
    const atCap = validateFeedback({ ...valid, message: 'a'.repeat(LIMITS.message.max) });
    expect(atCap.ok).toBe(true);
  });

  it('rejects a name or message that is too short to be real', () => {
    const shortName = validateFeedback({ ...valid, name: 'A' });
    expect(shortName.ok).toBe(false);
    if (!shortName.ok) expect(shortName.errors.name).toBe('tooShort');

    const shortMessage = validateFeedback({ ...valid, message: 'help' });
    expect(shortMessage.ok).toBe(false);
    if (!shortMessage.ok) expect(shortMessage.errors.message).toBe('tooShort');
  });

  it('keeps paragraphs in the message but collapses stray spacing', () => {
    const result = validateFeedback({
      ...valid,
      message: 'First   paragraph.\r\n\r\nSecond    paragraph, still long enough.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.message).toBe('First paragraph.\n\nSecond paragraph, still long enough.');
  });

  it('is permissive about addresses but still catches obvious typos', () => {
    for (const email of ['a@b.co', 'first.last+tag@sub.example.kz', "o'brien@example.com"]) {
      const result = validateFeedback({ ...valid, email });
      expect(result.ok, `${email} should be accepted`).toBe(true);
    }

    for (const email of ['name@', '@example.com', 'name@example', 'two words@example.com']) {
      const result = validateFeedback({ ...valid, email });
      expect(result.ok, `${email} should be rejected`).toBe(false);
    }
  });

  it('falls back to Russian when the locale is not one of ours', () => {
    // The locale comes from the route, so anything else is a hand-built request.
    const result = validateFeedback({ ...valid, locale: 'de' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.locale).toBe('ru');
  });
});

describe('isFeedbackLocale', () => {
  it('accepts exactly the site locales', () => {
    expect(['ru', 'en', 'kk'].every(isFeedbackLocale)).toBe(true);
    expect(isFeedbackLocale('kz')).toBe(false);
    expect(isFeedbackLocale(undefined)).toBe(false);
  });
});
