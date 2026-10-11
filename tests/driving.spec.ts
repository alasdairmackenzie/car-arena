import { expect, test } from '@playwright/test';

test('left and right accelerate automatically while steering', async ({ page }) => {
  await page.goto('/?solo=1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-players', '1');
  await page.keyboard.down('a');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeGreaterThan(60);
  await expect.poll(async () => Number(await arena.getAttribute('data-angle'))).toBeLessThan(-1.7);
  await page.keyboard.up('a');
  await page.keyboard.down('d');
  await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeGreaterThan(100);
  await page.keyboard.up('d');
});

test('desktop arena fits the viewport and stays centered without stretching', async ({ page }) => {
  await page.goto('/?solo=1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 2560, height: 900 },
    { width: 800, height: 1200 },
  ]) {
    await page.setViewportSize(viewport);
    const arena = page.locator('#game');
    await expect.poll(async () => {
      const box = await arena.boundingBox();
      if (!box) throw new Error('Arena not visible');
      return Math.abs(box.width - Math.min(viewport.width, viewport.height * 1.6));
    }).toBeLessThan(2);
    const box = (await arena.boundingBox())!;
    expect(Math.abs(box.height - box.width / 1.6)).toBeLessThan(2);
    expect(Math.abs(box.x - (viewport.width - box.width) / 2)).toBeLessThan(2);
    expect(Math.abs(box.y - (viewport.height - box.height) / 2)).toBeLessThan(2);
    await expect.poll(async () => (await arena.locator('canvas').boundingBox())?.width).toBeCloseTo(box.width, 0);
    await expect.poll(async () => Number(await arena.getAttribute('data-camera-zoom')))
      .toBeCloseTo(box.width / 1440, 2);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - innerWidth,
      y: document.documentElement.scrollHeight - innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  }
});

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
