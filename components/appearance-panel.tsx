'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import {
  FONT_SCALES,
  getServerSnapshot,
  getSnapshot,
  parsePreferences,
  savePreferences,
  subscribe,
  type Preferences,
} from '@/lib/appearance';

/**
 * Appearance controls: theme, text size, contrast (§17.6 and §17.7).
 *
 * These live in one panel rather than scattered across the UI, because the
 * people who need larger text usually also want more contrast, and asking an
 * elderly traveller to hunt for two separate controls is the failure mode.
 *
 * All three are token swaps, so nothing here re-renders page content.
 */
export function AppearancePanel() {
  const t = useTranslations('Appearance');
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const prefs = parsePreferences(raw);

  function update(patch: Partial<Preferences>) {
    savePreferences({ ...prefs, ...patch });
  }

  // Close on Escape or an outside click, returning focus to the trigger.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const group = 'flex rounded-md border border-border-strong overflow-hidden';
  const option = (active: boolean) =>
    [
      'px-3 py-1.5 text-sm min-w-11 transition-colors',
      active
        ? 'bg-brand text-on-brand font-semibold'
        : 'bg-surface text-text hover:bg-surface-sunken',
    ].join(' ');

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="border-border-strong text-text hover:bg-surface-sunken flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
      >
        {/* Two letters at different sizes: the conventional "text size" mark,
            legible without colour and without an icon font to download. */}
        <span aria-hidden="true" className="font-semibold">
          A<span className="text-xs">a</span>
        </span>
        <span className="hidden sm:inline">{t('label')}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('label')}
          className="glass-strong absolute end-0 z-50 mt-2 w-64 rounded-xl p-4"
        >
          <fieldset className="mb-4">
            <legend className="text-text mb-2 text-sm font-semibold">{t('textSize')}</legend>
            <div className={group}>
              {FONT_SCALES.map((scale, i) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => update({ fontScale: scale })}
                  aria-pressed={prefs.fontScale === scale}
                  className={option(prefs.fontScale === scale)}
                >
                  {t(`size${i}` as 'size0' | 'size1' | 'size2')}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-4">
            <legend className="text-text mb-2 text-sm font-semibold">{t('theme')}</legend>
            <div className={group}>
              {(['system', 'light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => update({ theme })}
                  aria-pressed={prefs.theme === theme}
                  className={option(prefs.theme === theme)}
                >
                  {t(theme)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-text mb-2 text-sm font-semibold">{t('contrast')}</legend>
            <div className={group}>
              {(['normal', 'high'] as const).map((contrast) => (
                <button
                  key={contrast}
                  type="button"
                  onClick={() => update({ contrast })}
                  aria-pressed={prefs.contrast === contrast}
                  className={option(prefs.contrast === contrast)}
                >
                  {t(contrast)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
