import { test, expect } from '@playwright/test';

test('KB home loads with search and categories', async ({ page }) => {
  await page.goto('/knowledge-base');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
  await expect(page.getByText(/categor|article|guide|getting started|browse/i).first()).toBeVisible();
});

test('KB search accepts a query without crashing', async ({ page }) => {
  await page.goto('/knowledge-base');
  const search = page.getByPlaceholder(/search/i).first();
  await search.fill('report');
  await search.press('Enter');
  await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
});

test('article list loads', async ({ page }) => {
  await page.goto('/knowledge-base/articles');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/article/i).first()).toBeVisible();
});

test('article view renders content', async ({ page }) => {
  await page.goto('/knowledge-base/articles');
  const link = page.locator('a[href*="/knowledge-base/articles/"]').first();
  test.skip(!(await link.count()), 'no articles seeded');
  await link.click();
  await expect(page).toHaveURL(/\/knowledge-base\/articles\/.+/);
  await expect(page.locator('article, .prose, main').first()).toBeVisible();
});

test('new article editor loads for superuser', async ({ page }) => {
  await page.goto('/knowledge-base/articles/new');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/title|content|body|markdown|new article/i).first()).toBeVisible();
});
