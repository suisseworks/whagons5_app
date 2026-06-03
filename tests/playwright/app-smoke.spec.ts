import { expect, test } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@test.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Tomates05';
const TEST_TENANT_ID = process.env.TEST_TENANT_ID || 'testing';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function expectSignedOutShell(page: import('@playwright/test').Page) {
  await expect(page.getByText('Whagons').first()).toBeVisible();
  await expect(page.getByText('Sign In').first()).toBeVisible();
}

async function seedTestingStorage(page: import('@playwright/test').Page) {
  await page.addInitScript((tenantId) => {
    window.localStorage.setItem('wh_onboarding_tour_completed', '1');
    window.localStorage.setItem('wh-property-scope', JSON.stringify({ selectedPropertyId: 'all' }));
    window.localStorage.setItem('wh_auth_subdomain', tenantId);
  }, TEST_TENANT_ID);
}

async function chooseTestingTenantIfPrompted(page: import('@playwright/test').Page) {
  const tenantName = new RegExp(`^${escapeRegExp(TEST_TENANT_ID)}$`, 'i');
  const tenantChoice = page.getByText(tenantName).first();

  await tenantChoice.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await tenantChoice.isVisible().catch(() => false)) {
    await tenantChoice.click();
  }
}

test.describe('Whagons mobile web smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seedTestingStorage(page);
  });

  test('renders the signed-out app shell', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expectSignedOutShell(page);
  });

  test('keeps an unauthenticated NFC tap deep link from crashing the app', async ({ page }) => {
    await page.goto('/nfc/tap/playwright-smoke-tag?tenantId=hotel-1', { waitUntil: 'domcontentloaded' });

    await expectSignedOutShell(page);
  });

  test('keeps an NFC programming deep link from crashing the app', async ({ page }) => {
    const tagUrl = encodeURIComponent('https://hotel-1.whagons.com/nfc/tap/playwright-smoke-tag');

    await page.goto(`/nfc/program/playwright-smoke-tag?tenantId=hotel-1&url=${tagUrl}`, { waitUntil: 'domcontentloaded' });

    await expectSignedOutShell(page);
  });

  test('logs in with the web test user and reaches the testing workspace', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await page.getByPlaceholder('Email').fill(TEST_EMAIL);
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByText('Sign In', { exact: true }).last().click();

    await chooseTestingTenantIfPrompted(page);

    await expect(page.getByPlaceholder('Search tasks...')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Everything', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Sign In', { exact: true })).toHaveCount(0);
  });
});
