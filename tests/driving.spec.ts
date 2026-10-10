import { expect, test } from '@playwright/test';

test('drive, steer, brake and reset in a real browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-players', '1');
  await arena.click();
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await arena.getAttribute('data-y'))).toBeLessThan(380);
  await page.keyboard.down('d');
  await expect.poll(async () => Number(await arena.getAttribute('data-angle'))).toBeGreaterThan(-1.2);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  await page.keyboard.down('Space');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeLessThan(20);
  await page.keyboard.up('Space');
  await page.getByRole('button', { name: 'Reset car' }).click();
  await expect.poll(async () => Number(await arena.getAttribute('data-y'))).toBe(450);
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBe(0);
  expect(errors).toEqual([]);
});

test('releasing focus clears held controls', async ({ page }) => {
  await page.goto('/');
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-players', '1');
  await arena.click();
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeGreaterThan(100);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('w');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeLessThan(10);
});
