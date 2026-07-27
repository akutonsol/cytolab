#!/usr/bin/env node
/**
 * P5-4 Phase B Part 2 — static "no paste-URL" gate.
 *
 * Proves the retired legacy paste-URL CREATION/WRITE path cannot silently return, while preserving the
 * read path and the retained DB column. Deterministic source scan (no stack/DB/browser). It targets the
 * SPECIFIC active product surfaces — it deliberately does NOT flag legitimate historical references
 * (schema column + comment, ingestion's `slideUrl: ''` compatibility write, test-data `slideUrl: ''`,
 * migrations, doc comments), which remain valid.
 *
 * Usage: node apps/web/acceptance/no-paste-url.check.mjs   (run from repo root)
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const P = (rel) => path.join(ROOT, rel);
const read = (rel) => (existsSync(P(rel)) ? readFileSync(P(rel), 'utf8') : null);

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

// 1) No user-facing paste-URL component.
check('AddSlideModal.tsx removed', !existsSync(P('apps/web/src/components/AddSlideModal.tsx')));

// 2) No supported client DigitalSlide.slideUrl in the response contract type.
const wsiLib = read('apps/web/src/lib/wsi.ts') ?? '';
check('client DigitalSlide has no slideUrl field', !/\n\s*slideUrl\s*:/.test(wsiLib));

// 3) No web caller POSTs the legacy /wsi/record/:id create endpoint (GET /wsi/record/:id is allowed;
//    ingestion uses the distinct /wsi/records/:id/slide-uploads).
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}
const webFiles = walk(P('apps/web/src'));
const pastePosters = webFiles.filter((f) => {
  const s = readFileSync(f, 'utf8');
  // a .post(...) call whose target is the singular /wsi/record/ path (not /wsi/records/…)
  return /\.post\([^)]*\/wsi\/record\/(?!s)/.test(s) || /post\(\s*`\/wsi\/record\/\$\{/.test(s);
});
check('no web caller POSTs /wsi/record/:id', pastePosters.length === 0, pastePosters.map((f) => path.relative(ROOT, f)).join(', '));

// 4) API: no POST create handler for that route, no createSlide handler.
const ctrl = read('apps/api/src/modules/wsi/wsi.controller.ts') ?? '';
check("no @Post('record/:recordId') handler", !/@Post\(\s*['"]record\/:recordId['"]\s*\)/.test(ctrl));
check('controller has no createSlide', !/\bcreateSlide\b/.test(ctrl));

// 5) API service: no createSlide write path, no slideUrl in the response projection.
const svc = read('apps/api/src/modules/wsi/wsi.service.ts') ?? '';
check('service has no createSlide method', !/\basync\s+createSlide\b/.test(svc));
check('slideSelect projection excludes slideUrl', !/slideUrl\s*:\s*true/.test(svc));

// 6) API DTO: CreateSlideDto retired.
const dto = read('apps/api/src/modules/wsi/dto/wsi.dto.ts') ?? '';
// The class DEFINITION must be gone (a comment naming it as retired is legitimate).
check('CreateSlideDto class retired', !/\bclass\s+CreateSlideDto\b/.test(dto));
check('no active CreateSlideDto import/use in the wsi controller/service', !/\bCreateSlideDto\b/.test(ctrl) && !/\bCreateSlideDto\b/.test(svc));

// 7) READ path preserved.
check("GET record/:recordId preserved", /@Get\(\s*['"]record\/:recordId['"]\s*\)/.test(ctrl));
check('service getByRecord preserved', /\bgetByRecord\b/.test(svc));

// 8) DB column retained (schema).
const schema = read('apps/api/prisma/schema.prisma') ?? '';
check('DigitalSlide.slideUrl DB column retained', /\n\s*slideUrl\s+String/.test(schema));

let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `   [${r.detail}]`}`);
  if (r.ok) pass++;
}
console.log(`\n${pass}/${results.length} no-paste-url checks passed`);
process.exit(pass === results.length ? 0 : 1);
