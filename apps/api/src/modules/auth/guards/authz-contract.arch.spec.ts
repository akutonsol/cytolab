import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

/**
 * R-001a authorization-contract architecture invariant.
 *
 * EVERY production HTTP handler must declare exactly one RECOGNIZED authorization
 * contract, so that the fail-closed PermissionsGuard (R-001b) can never deny a
 * legitimate route and no route can silently rely on fail-open-by-omission.
 *
 * Recognized contracts (method- or class-level):
 *   - @RequirePermissions(...)  → role-permission gate
 *   - @Public()                 → intentionally unauthenticated
 *   - @Portal()                 → client-portal contract (PortalAuthGuard + ownership)
 *   - @AuthorizationContract()  → authenticated/self-service or dedicated-guard authz
 *   - @UseGuards(... SuperuserGuard ...) → superuser-only surface
 *   - @DeliveryProtected()      → the P5-5B delivery-token contract, a composed
 *                                 applyDecorators(Public(), UseGuards(DeliveryTokenGuard));
 *                                 recognized SPECIFICALLY by name (not arbitrary composed decorators).
 *
 * NOT recognized on their own: FeatureGuard (feature flag, not authz) and
 * WorkforceManagerGuard (must also carry @AuthorizationContract, since the global
 * PermissionsGuard runs first). This is a pure source scan — deterministic, no app
 * bootstrap, no import graph — so it runs anywhere and blocks new unclassified
 * handlers in CI.
 */

const SRC = resolve(__dirname, '../../..'); // apps/api/src
const VERB = /^\s*@(Get|Post|Put|Patch|Delete|All|Head|Options)\(([^)]*)\)/;
const isDecorator = (l: string) => /^\s*@[A-Za-z]/.test(l);
const isCommentOrBlank = (l: string) => /^\s*(\/\/|\/\*|\*|$)/.test(l);
const hasContract = (text: string) =>
  /@RequirePermissions\(/.test(text) ||
  /@Public\(\)/.test(text) ||
  /@Portal\(\)/.test(text) ||
  /@AuthorizationContract\(/.test(text) ||
  /@UseGuards\([^)]*SuperuserGuard/.test(text) ||
  // @DeliveryProtected() is the P5-5B composed delivery-token contract (applyDecorators(Public(),
  // UseGuards(DeliveryTokenGuard))). Recognized by exact name only — NOT a broadening to arbitrary composed decorators.
  /@DeliveryProtected\(/.test(text);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.controller.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

interface Handler { file: string; className: string; method: string; route: string; }

function unclassifiedHandlers(): Handler[] {
  const bad: Handler[] = [];
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const ctrlIdx = lines.findIndex((l) => /@Controller\(/.test(l));
    if (ctrlIdx < 0) continue;
    const ctrlArg = (lines[ctrlIdx].match(/@Controller\(([^)]*)\)/)?.[1] ?? '').replace(/['"`]/g, '').trim();
    const className = (readFileSync(file, 'utf8').match(/export class (\w+)/) ?? [])[1] ?? file;
    let firstHandler = lines.findIndex((l) => VERB.test(l));
    if (firstHandler < 0) continue;
    const classRegion = lines.slice(Math.max(0, ctrlIdx - 6), firstHandler).join('\n');
    const classContract = hasContract(classRegion);

    let buf: string[] = [];
    for (const line of lines) {
      if (isDecorator(line) || isCommentOrBlank(line)) { buf.push(line); continue; }
      const verbLine = buf.find((b) => VERB.test(b));
      if (verbLine) {
        const block = buf.join('\n');
        const vm = verbLine.match(VERB)!;
        const route = `${vm[1].toUpperCase()} /${[ctrlArg, vm[2].replace(/['"`]/g, '').trim()].filter(Boolean).join('/')}`;
        const method = (line.match(/^\s*(?:async\s+)?(\w+)\s*\(/) ?? [])[1] ?? '(?)';
        if (!classContract && !hasContract(block)) {
          bad.push({ file: relative(SRC, file), className, method, route });
        }
      }
      buf = [];
    }
  }
  return bad;
}

describe('R-001a — every HTTP handler declares a recognized authorization contract', () => {
  it('has zero unclassified (fail-open-by-omission) handlers', () => {
    const bad = unclassifiedHandlers();
    if (bad.length) {
      const lines = bad.map((h) => `  [${h.className}] ${h.method}  ${h.route}   (${h.file})`).join('\n');
      throw new Error(
        `${bad.length} handler(s) lack an explicit authorization contract ` +
          `(add @RequirePermissions / @Public / @Portal / @AuthorizationContract, ` +
          `or @UseGuards(SuperuserGuard)):\n${lines}`,
      );
    }
    expect(bad.length).toBe(0);
  });

  it('recognizer has teeth: flags a contract-less route, rejects FeatureGuard-only, accepts explicit contracts', () => {
    expect(hasContract("@Get('x')")).toBe(false); // fail-open-by-omission → flagged
    expect(hasContract('@UseGuards(FeatureGuard)')).toBe(false); // feature flag is NOT authorization
    expect(hasContract("@AuthorizationContract('authenticated')")).toBe(true);
    expect(hasContract("@RequirePermissions('a:b')")).toBe(true);
    expect(hasContract('@Public()')).toBe(true);
    expect(hasContract('@Portal()')).toBe(true);
    expect(hasContract('@UseGuards(SuperuserGuard)')).toBe(true);
    // @DeliveryProtected() IS an authorized composed contract (Public() + DeliveryTokenGuard) — recognized by name…
    expect(hasContract('@DeliveryProtected()')).toBe(true);
    // …but recognition is NOT broadened to arbitrary composed decorators: an unknown composed decorator still fails.
    expect(hasContract('@SomethingComposed()')).toBe(false);
    expect(hasContract('@UseGuards(DeliveryTokenGuard)')).toBe(false); // the raw guard alone is not a recognized contract
  });
});
