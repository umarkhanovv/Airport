import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { MappingModule } from './mapping-types.mts';

/**
 * Loads the Stage 8 mapping from `migration/`, which is not in this repository.
 *
 * The specifier is built at runtime rather than written as a literal, so
 * TypeScript never tries to resolve it. A literal import would typecheck on a
 * machine that happens to have the private directory and fail on every clean
 * clone — which is exactly how this broke the first time.
 */
export async function loadMapping(root = process.cwd()): Promise<MappingModule> {
  const file = path.join(root, 'migration', 'mapping.mts');

  if (!fs.existsSync(file)) {
    console.error(`\nNo mapping found at ${path.relative(root, file)}.\n`);
    console.error('The Stage 8 mapping is a working document and is kept outside this');
    console.error('repository. Run `npm run migrate:crawl` to build the inventory, then');
    console.error('supply a mapping.mts exporting MAPPING and ALIASES — see');
    console.error('scripts/migrate/mapping-types.mts for the shape.\n');
    process.exit(1);
  }

  return (await import(pathToFileURL(file).href)) as MappingModule;
}
