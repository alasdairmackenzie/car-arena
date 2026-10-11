import { expect, test } from '@playwright/test';

test('drive, steer and brake in a real browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?solo=1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-players', '1');
  await arena.click();
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await arena.getAttribute('data-y')), { intervals: [20] }).toBeLessThan(380);
  await page.keyboard.down('d');
  await expect.poll(async () => Number(await arena.getAttribute('data-angle')), { intervals: [20] }).toBeGreaterThan(-1.2);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  await page.keyboard.down('Space');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeLessThan(20);
  await page.keyboard.up('Space');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeLessThan(10);
  expect(errors).toEqual([]);
});

test('releasing focus clears held controls', async ({ page }) => {
  await page.goto('/?solo=1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-players', '1');
  await arena.click();
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeGreaterThan(100);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('w');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeLessThan(10);
});
