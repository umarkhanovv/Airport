import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA, contrastRatio } from '@/lib/color';

/**
 * The colour system, asserted so it cannot drift (plan §6.2).
 *
 * Contrast regressions are invisible in code review — a designer nudging a
 * token by one step to "warm it up" can drop a whole theme below AA without
 * anyone noticing until an audit. These tests encode exactly where each token
 * may and may not be used, including the negative cases.
 */

const LIGHT = {
  surface: '#ffffff',
  surfaceRaised: '#f8f6f4',
  surfaceSunken: '#f1ede9',
  text: '#1a1613',
  textMuted: '#5b524d',
  borderStrong: '#918275',
  brand: '#ce7b44',
  brandText: '#a56236',
  brandTextStrong: '#9a5c33',
  arrival: '#0f7a73',
  arrivalSoft: '#ecf7f5',
  focus: '#9a5c33',
} as const;

const DARK = {
  surface: '#0d1219',
  surfaceRaised: '#141b24',
  text: '#ececed',
  textMuted: '#a3a6ad',
  borderStrong: '#5f6d82',
  brand: '#ce7b44',
  brandText: '#e3874b',
  arrival: '#3fc7bd',
  arrivalSoft: '#10262a',
  focus: '#e3874b',
} as const;

const HIGH_CONTRAST_LIGHT = {
  surface: '#ffffff',
  text: '#000000',
  textMuted: '#1f1a17',
  brandText: '#7a4826',
  arrival: '#044b46',
} as const;

const HIGH_CONTRAST_DARK = {
  surface: '#000000',
  text: '#ffffff',
  textMuted: '#e6e6e6',
  brandText: '#f0a068',
  arrival: '#7ce6dc',
} as const;

describe('light theme', () => {
  const surfaces = [LIGHT.surface, LIGHT.surfaceRaised, LIGHT.surfaceSunken];

  it('body text passes AA on every surface', () => {
    for (const surface of surfaces) {
      expect(contrastRatio(LIGHT.text, surface), surface).toBeGreaterThanOrEqual(AA.normalText);
    }
  });

  it('muted text passes AA on every surface', () => {
    for (const surface of surfaces) {
      expect(contrastRatio(LIGHT.textMuted, surface), surface).toBeGreaterThanOrEqual(
        AA.normalText
      );
    }
  });

  it('brand text tokens pass AA for links and small text', () => {
    expect(contrastRatio(LIGHT.brandText, LIGHT.surface)).toBeGreaterThanOrEqual(AA.normalText);
    expect(contrastRatio(LIGHT.brandTextStrong, LIGHT.surface)).toBeGreaterThanOrEqual(
      AA.normalText
    );
  });

  it('the arrival accent passes AA as text, unlike the raw brand colour', () => {
    // Teal is safe at body size on white; terracotta is not. That asymmetry is
    // why they are separate tokens rather than a symmetric pair.
    expect(contrastRatio(LIGHT.arrival, LIGHT.surface)).toBeGreaterThanOrEqual(AA.normalText);
  });

  it('arrival text is legible on its own tinted fill', () => {
    expect(contrastRatio(LIGHT.arrival, LIGHT.arrivalSoft)).toBeGreaterThanOrEqual(AA.normalText);
  });

  it('strong borders meet the non-text threshold', () => {
    expect(contrastRatio(LIGHT.borderStrong, LIGHT.surface)).toBeGreaterThanOrEqual(AA.nonText);
  });

  it('the focus ring meets the non-text threshold', () => {
    expect(contrastRatio(LIGHT.focus, LIGHT.surface)).toBeGreaterThanOrEqual(AA.nonText);
  });

  /**
   * Guard rail, not an aspiration. If someone darkens --brand to "make it
   * accessible", this fails and forces the conversation — the token is the
   * airport's actual logo colour and is not ours to change.
   */
  it('raw brand is large-text-only on white and must never carry body text', () => {
    const ratio = contrastRatio(LIGHT.brand, LIGHT.surface);
    expect(ratio).toBeGreaterThanOrEqual(AA.largeText);
    expect(ratio).toBeLessThan(AA.normalText);
  });

  it('black on a brand fill passes AA; white on a brand fill does not', () => {
    expect(contrastRatio('#000000', LIGHT.brand)).toBeGreaterThanOrEqual(AA.normalText);
    expect(contrastRatio('#ffffff', LIGHT.brand)).toBeLessThan(AA.normalText);
  });

  it('white on an arrival fill passes AA', () => {
    expect(contrastRatio('#ffffff', LIGHT.arrival)).toBeGreaterThanOrEqual(AA.normalText);
  });
});

describe('dark theme', () => {
  const surfaces = [DARK.surface, DARK.surfaceRaised];

  it('body and muted text pass AA on every surface', () => {
    for (const surface of surfaces) {
      expect(contrastRatio(DARK.text, surface), surface).toBeGreaterThanOrEqual(AA.normalText);
      expect(contrastRatio(DARK.textMuted, surface), surface).toBeGreaterThanOrEqual(AA.normalText);
    }
  });

  it('both accents pass AA on the twilight surface', () => {
    expect(contrastRatio(DARK.brandText, DARK.surface)).toBeGreaterThanOrEqual(AA.normalText);
    expect(contrastRatio(DARK.arrival, DARK.surface)).toBeGreaterThanOrEqual(AA.normalText);
  });

  it('raw brand passes AA on dark, unlike on light', () => {
    expect(contrastRatio(DARK.brand, DARK.surface)).toBeGreaterThanOrEqual(AA.normalText);
  });

  it('strong borders and focus ring meet the non-text threshold', () => {
    expect(contrastRatio(DARK.borderStrong, DARK.surface)).toBeGreaterThanOrEqual(AA.nonText);
    expect(contrastRatio(DARK.focus, DARK.surface)).toBeGreaterThanOrEqual(AA.nonText);
  });

  it('arrival text is legible on its own tinted fill', () => {
    expect(contrastRatio(DARK.arrival, DARK.arrivalSoft)).toBeGreaterThanOrEqual(AA.normalText);
  });
});

describe('high-contrast mode (accessibility panel)', () => {
  it('clears AAA on light, not merely AA', () => {
    // This mode exists for users who cannot read AA. Meeting only AA would
    // make the toggle pointless.
    expect(contrastRatio(HIGH_CONTRAST_LIGHT.text, HIGH_CONTRAST_LIGHT.surface)).toBeGreaterThan(7);
    expect(
      contrastRatio(HIGH_CONTRAST_LIGHT.textMuted, HIGH_CONTRAST_LIGHT.surface)
    ).toBeGreaterThan(7);
    expect(
      contrastRatio(HIGH_CONTRAST_LIGHT.brandText, HIGH_CONTRAST_LIGHT.surface)
    ).toBeGreaterThan(7);
    expect(contrastRatio(HIGH_CONTRAST_LIGHT.arrival, HIGH_CONTRAST_LIGHT.surface)).toBeGreaterThan(
      7
    );
  });

  it('clears AAA on dark', () => {
    expect(contrastRatio(HIGH_CONTRAST_DARK.text, HIGH_CONTRAST_DARK.surface)).toBeGreaterThan(7);
    expect(contrastRatio(HIGH_CONTRAST_DARK.textMuted, HIGH_CONTRAST_DARK.surface)).toBeGreaterThan(
      7
    );
    expect(contrastRatio(HIGH_CONTRAST_DARK.brandText, HIGH_CONTRAST_DARK.surface)).toBeGreaterThan(
      7
    );
    expect(contrastRatio(HIGH_CONTRAST_DARK.arrival, HIGH_CONTRAST_DARK.surface)).toBeGreaterThan(
      7
    );
  });

  it('is a genuine improvement over the default theme', () => {
    expect(contrastRatio(HIGH_CONTRAST_LIGHT.arrival, HIGH_CONTRAST_LIGHT.surface)).toBeGreaterThan(
      contrastRatio(LIGHT.arrival, LIGHT.surface)
    );
    expect(
      contrastRatio(HIGH_CONTRAST_LIGHT.brandText, HIGH_CONTRAST_LIGHT.surface)
    ).toBeGreaterThan(contrastRatio(LIGHT.brandText, LIGHT.surface));
  });
});

describe('the two direction accents are distinguishable', () => {
  it('differ enough from each other to read as different at a glance', () => {
    // They must not be told apart by colour alone (every use is labelled), but
    // when they are seen together they should be obviously different.
    expect(contrastRatio(LIGHT.brand, LIGHT.arrival)).toBeGreaterThan(1.5);
    expect(contrastRatio(DARK.brand, DARK.arrival)).toBeGreaterThan(1.5);
  });
});

describe('stylesheet and tokens agree', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');

  it('declares every colour this suite asserts', () => {
    const asserted = new Set(
      [
        ...Object.values(LIGHT),
        ...Object.values(DARK),
        ...Object.values(HIGH_CONTRAST_LIGHT),
        ...Object.values(HIGH_CONTRAST_DARK),
      ].map((c) => c.toLowerCase())
    );

    const missing = [...asserted].filter((c) => !css.toLowerCase().includes(c));
    expect(missing, 'colours tested but absent from globals.css').toEqual([]);
  });

  it('loads the cyrillic-ext subset, without which Kazakh breaks', () => {
    expect(css).toContain('golos-text-cyrillic-ext.woff2');
    expect(css).toContain('U+0460-052F');
  });

  it('keeps every font non-blocking', () => {
    const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(4);
    for (const face of faces) expect(face).toContain('font-display: swap');
  });
});
