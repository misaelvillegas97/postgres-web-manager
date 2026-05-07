import { expect, test } from '@playwright/test';

const user = {
  id: '00000000-0000-4000-8000-000000000101',
  email: 'admin@pgstudio.local',
  role: 'ADMIN',
  workspaceId: '00000000-0000-4000-8000-000000000001',
};

async function mockSuccessfulApi(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        user,
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresIn: 3600,
        },
      }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  await page.route('**/api/connections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('.logo-text')).toHaveText('PgStudio');
  await expect(page).toHaveURL(/\/login$/);
});

test('signs in and opens the query workspace', async ({ page }) => {
  await mockSuccessfulApi(page);
  await page.goto('/login');

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('dev-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole('link', { name: 'Query' })).toHaveClass(/active/);
  await expect(page.getByRole('link', { name: 'Connections' })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
});

test('shows API credential errors on failed sign in', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid email or password' }),
    });
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
