#!/usr/bin/env node
/**
 * Completes the `output: 'standalone'` bundle.
 *
 * `next build` emits `.next/standalone/` with a server and its minimal
 * node_modules, but deliberately leaves out the static assets — they are
 * expected to be served by a CDN. We self-host, so they have to be copied in
 * or every page loads without CSS.
 *
 * Written in Node rather than `cp -r` so the same command works regardless of
 * the operating system the airport deploys on.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error('.next/standalone is missing — run `next build` first.');
  process.exit(1);
}

const copies = [
  { from: path.join(root, '.next', 'static'), to: path.join(standalone, '.next', 'static') },
  { from: path.join(root, 'public'), to: path.join(standalone, 'public') },
];

for (const { from, to } of copies) {
  if (!fs.existsSync(from)) continue;
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

console.log('standalone bundle ready: node .next/standalone/server.js');
