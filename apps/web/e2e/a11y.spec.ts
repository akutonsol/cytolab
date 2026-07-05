import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// PHASE 12 — Accessibility (axe-core). Reports violations by impact per page and
// fails only on `critical` (serious/moderate/minor are reported for triage).
const PAGES = ['/dashboard', '/patients', '/result-sheets', '/workforce', '/knowledge-base', '/system/support'];

for (const path of PAGES) {
  test(`a11y — ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const v of results.violations) counts[v.impact ?? 'minor'] = (counts[v.impact ?? 'minor'] ?? 0) + 1;
    console.log(`AXE ${path}  critical=${counts.critical} serious=${counts.serious} moderate=${counts.moderate} minor=${counts.minor}`);
    for (const v of results.violations) {
      console.log(`   [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)`);
    }
    // Fail only on critical; serious+ are reported for the QA log.
    expect(results.violations.filter((v) => v.impact === 'critical').map((v) => v.id), `critical a11y on ${path}`).toEqual([]);
  });
}
