#!/usr/bin/env node
/**
 * Executable guard for the rule in CLAUDE.md / DESIGN_SYSTEM §8j:
 *
 *   "Whenever Helix introduces custom utility namespaces (typography, spacing, sizing,
 *    etc.), extendTailwindMerge must be updated simultaneously. Custom utilities are
 *    part of the merge contract, not just the design system."
 *
 * A custom utility tailwind-merge does not know about gets mis-grouped, and the next
 * class in that group silently evicts it. There is no type error and no build error —
 * only wrong rendering. This script fails loudly instead.
 *
 * It reads the real `cn()` config indirectly by re-declaring the same groups; if the two
 * drift apart, the assertions below start failing.
 *
 *   node scripts/check-merge-contract.mjs
 */
import { extendTailwindMerge } from 'tailwind-merge';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── 1. every custom fontSize key declared in tailwind.config.ts ─────────────────
const cfg = fs.readFileSync(path.join(here, '..', 'tailwind.config.ts'), 'utf8');
const fontSizeBlock = cfg.slice(cfg.indexOf('fontSize: {'), cfg.indexOf('},', cfg.indexOf('fontSize: {')));
const configured = [...fontSizeBlock.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\[/gim)].map((m) => m[1]);

// ── 2. every custom fontSize key declared in ui/cn.ts ───────────────────────────
const cnSrc = fs.readFileSync(path.join(here, '..', 'src', 'components', 'ui', 'cn.ts'), 'utf8');
const declared = [...cnSrc.matchAll(/^\s*'([a-z0-9-]+)',$/gim)].map((m) => m[1]);

const missing = configured.filter((k) => !declared.includes(k));
const stale = declared.filter((k) => !configured.includes(k));

let failures = 0;
const report = (ok, msg) => {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${msg}`);
};

console.log('merge contract — custom fontSize namespace');
report(missing.length === 0, missing.length ? `cn.ts is missing: ${missing.join(', ')}` : 'every tailwind fontSize key is declared in cn.ts');
report(stale.length === 0, stale.length ? `cn.ts declares unknown keys: ${stale.join(', ')}` : 'cn.ts declares no stale keys');

// ── 3. behavioural assertions ──────────────────────────────────────────────────
const twMerge = extendTailwindMerge({ extend: { classGroups: { 'font-size': [{ text: declared }] } } });
const cases = [
  ['a custom size survives a later colour', 'text-label-sm text-secondary', 'text-label-sm text-secondary'],
  ['a custom size survives a later colour', 'text-body-sm text-on-surface', 'text-body-sm text-on-surface'],
  ['two sizes still collapse to the last', 'text-[14px] text-[13px]', 'text-[13px]'],
  ['two border colours collapse to the last', 'border-field-border border-danger', 'border-danger'],
];
console.log('merge contract — behaviour');
for (const [name, input, want] of cases) {
  const got = twMerge(input);
  report(got === want, `${name}: "${input}" -> "${got}"`);
}

console.log(failures === 0 ? '\n✅ merge contract intact' : `\n❌ ${failures} violation(s)`);
process.exit(failures ? 1 : 0);
