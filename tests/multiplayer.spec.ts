import { expect, test, type Page } from '@playwright/test';
import type { CarSnapshot } from '../src/shared/simulation';

async function states(page: Page): Promise<CarSnapshot[]> {
  const raw = await page.getByRole('region', { name: 'Driving arena' }).getAttribute('data-state');
  return raw ? JSON.parse(raw) as CarSnapshot[] : [];
}

test('two browsers share a room, drive independently and converge after stopping', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const errors: string[] = [];
  for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
  try {
    await first.goto('/');
    const arenaA = first.getByRole('region', { name: 'Driving arena' });
    await expect(arenaA).toHaveAttribute('data-players', '1');
    await second.goto('/');
    const arenaB = second.getByRole('region', { name: 'Driving arena' });
    await expect(arenaA).toHaveAttribute('data-players', '2');
    await expect(arenaB).toHaveAttribute('data-players', '2');
    expect(await arenaA.getAttribute('data-room')).toBe(await arenaB.getAttribute('data-room'));
    const firstId = await arenaA.getAttribute('data-player');
    const secondId = await arenaB.getAttribute('data-player');
    expect(firstId).not.toBe(secondId);

    const before = await states(first);
    const firstStart = before.find(car => car.id === firstId)!;
    const secondStart = before.find(car => car.id === secondId)!;
    await arenaA.click();
    await first.keyboard.down('s');
    await expect.poll(async () =>
      (await states(second)).find(car => car.id === firstId)?.y ?? 0,
    ).toBeGreaterThan(firstStart.y + 60);
    await first.keyboard.up('s');
    await first.keyboard.down('Space');
    await expect.poll(async () => Number(await arenaA.getAttribute('data-speed'))).toBeLessThan(5);
    await first.keyboard.up('Space');
    expect((await states(first)).find(car => car.id === secondId)!.y).toBeCloseTo(secondStart.y, 1);

    await arenaB.click();
    await second.keyboard.down('w');
    await expect.poll(async () =>
      (await states(first)).find(car => car.id === secondId)?.y ?? Infinity,
    ).toBeLessThan(secondStart.y - 40);
    await second.keyboard.up('w');
    await second.keyboard.down('Space');
    await expect.poll(async () => Number(await arenaB.getAttribute('data-speed'))).toBeLessThan(5);
    await second.keyboard.up('Space');
    await expect.poll(async () => {
      const a = await states(first);
      const b = await states(second);
      return Math.max(...a.map(car => {
        const other = b.find(other => other.id === car.id);
        return other ? Math.hypot(car.x - other.x, car.y - other.y) : Infinity;
      }));
    }).toBeLessThan(2);
    expect(errors).toEqual([]);

    await secondContext.close();
    await expect(arenaA).toHaveAttribute('data-players', '1');
    expect((await states(first))[0].id).toBe(firstId);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('connection loss is visible and does not switch to a solo world', async ({ page }) => {
  await page.goto('/');
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-connected', 'true');
  await page.context().setOffline(true);
  await expect(page.getByRole('alert')).toContainText('Disconnected', { timeout: 15000 });
  await expect(arena).toHaveAttribute('data-connected', 'false');
  await expect(arena).toHaveAttribute('data-players', '0');
  await expect(page.getByRole('button', { name: 'Reset car' })).toBeDisabled();
});

test('ramming transfers motion to another browser car, and reset avoids it', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const a = await contextA.newPage();
    const b = await contextB.newPage();
    await a.goto('/');
    const arenaA = a.getByRole('region', { name: 'Driving arena' });
    await expect(arenaA).toHaveAttribute('data-players', '1');
    await b.goto('/');
    const arenaB = b.getByRole('region', { name: 'Driving arena' });
    await expect(arenaA).toHaveAttribute('data-players', '2');
    await expect(arenaB).toHaveAttribute('data-players', '2');
    const idB = await arenaB.getAttribute('data-player');
    const initialY = Number(await arenaB.getAttribute('data-y'));
    await arenaA.click();
    await a.keyboard.down('w');
    await expect.poll(async () => Number(await arenaB.getAttribute('data-y'))).toBeLessThan(initialY - 20);
    await a.keyboard.up('w');
    await a.keyboard.down('Space');
    await expect.poll(async () =>
      (await states(a)).find(car => car.id === idB)?.y ?? Infinity,
    ).toBeLessThan(initialY - 20);
    await a.keyboard.up('Space');
    await a.getByRole('button', { name: 'Reset car' }).click();
    await expect.poll(async () => Number(await arenaA.getAttribute('data-y'))).toBe(450);
    const cars = await states(a);
    expect(Math.hypot(cars[0].x - cars[1].x, cars[0].y - cars[1].y)).toBeGreaterThan(100);
    await expect(a.getByRole('alert')).toBeHidden();
    await expect(b.getByRole('alert')).toBeHidden();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('a failed join reports an error instead of launching local physics', async ({ page }) => {
  await page.route('**/game/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Could not join the arena');
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-connected', 'false');
  await expect(arena).toHaveAttribute('data-players', '0');
});
