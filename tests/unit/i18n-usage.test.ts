import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import kk from '@/messages/kk.json';
import ru from '@/messages/ru.json';

/**
 * Every translation key referenced in code must exist in the catalogues.
 *
 * The parity test next door only proves the three locales agree with each
 * other — so deleting a namespace from all three keeps it green while the site
 * renders raw keys like "Placeholder.underConstruction" to real users. That is
 * exactly what happened in Stage 2, and only a screenshot caught it.
 *
 * This is deliberately a static scan rather than a runtime check: a missing
 * key should fail the build, not a page view in production.
 */

const ROOT = path.resolve(__dirname, '../..');
const CATALOGUES = { ru, en, kk } as const;

function sourceFiles(): string[] {
  const out = execFileSync(
    'find',
    [
      path.join(ROOT, 'app'),
      path.join(ROOT, 'components'),
      '-type',
      'f',
      '(',
      '-name',
      '*.ts',
      '-o',
      '-name',
      '*.tsx',
      ')',
    ],
    { encoding: 'utf8' }
  );
  return out.split('\n').filter(Boolean);
}

function has(catalogue: unknown, dotted: string): boolean {
  return (
    dotted.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, catalogue) !== undefined
  );
}

interface Usage {
  file: string;
  namespace: string;
  key: string;
}

/**
 * Maps `const t = useTranslations('Ns')` to the variable, then finds literal
 * `t('key')` calls for it.
 *
 * Binding is resolved by position, not just by name: one file legitimately
 * declares `const t` twice in different function scopes — `Site` inside
 * generateMetadata and `Nav` inside the layout — so each call is attributed to
 * the nearest preceding declaration of that variable.
 *
 * Template-literal keys (`t(\`${x}.title\`)`) are skipped, since they cannot be
 * resolved statically; the e2e suite covers those by rendering real pages.
 */
function collectUsages(): Usage[] {
  const usages: Usage[] = [];

  const declaration =
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*namespace:\s*)?['"]([\w.]+)['"]/g;

  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, 'utf8');

    const bindings: Array<{ at: number; variable: string; namespace: string }> = [];
    for (const match of src.matchAll(declaration)) {
      bindings.push({ at: match.index ?? 0, variable: match[1], namespace: match[2] });
    }
    if (bindings.length === 0) continue;

    const variables = new Set(bindings.map((b) => b.variable));
    for (const variable of variables) {
      const call = new RegExp(`\\b${variable}\\(\\s*'([\\w.]+)'`, 'g');
      for (const match of src.matchAll(call)) {
        const at = match.index ?? 0;
        const binding = bindings
          .filter((b) => b.variable === variable && b.at < at)
          .sort((a, b) => b.at - a.at)[0];
        if (!binding) continue;
        usages.push({
          file: path.relative(ROOT, file),
          namespace: binding.namespace,
          key: match[1],
        });
      }
    }
  }

  return usages;
}

const usages = collectUsages();

describe('translation keys used in code', () => {
  it('finds a meaningful number of usages, so the scan is actually working', () => {
    // Guards against the regex silently matching nothing and the suite
    // passing vacuously.
    expect(usages.length).toBeGreaterThan(20);
  });

  it('all exist in every locale', () => {
    const missing: string[] = [];

    for (const usage of usages) {
      const dotted = `${usage.namespace}.${usage.key}`;
      for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
        if (!has(catalogue, dotted)) missing.push(`${locale}: ${dotted}  (${usage.file})`);
      }
    }

    expect(missing, `missing translation keys:\n${missing.join('\n')}`).toEqual([]);
  });

  it('references only namespaces that exist', () => {
    const namespaces = [...new Set(usages.map((u) => u.namespace))];
    const unknown = namespaces.filter((ns) => !has(ru, ns));
    expect(unknown, `unknown namespaces: ${unknown.join(', ')}`).toEqual([]);
  });
});
