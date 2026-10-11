import { expect, test, type Page } from '@playwright/test';
import { createLobby, joinLobby } from './lobby';
import type { GameSnapshot } from '../src/shared/game';

async function game(page: Page): Promise<GameSnapshot> {
  const raw = await page.getByRole('region', { name: 'Driving arena' }).getAttribute('data-game');
  if (!raw) throw new Error('Gameplay telemetry is not ready');
  return JSON.parse(raw) as GameSnapshot;
}

test('collect a gold core, shoot another car, drop its core and respawn empty', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const errors: string[] = [];
  try {
    const shooter = await contextA.newPage();
    const target = await contextB.newPage();
    for (const page of [shooter, target]) page.on('pageerror', error => errors.push(error.message));
    await shooter.goto('/');
    const lobby = await createLobby(shooter);
    const arenaA = shooter.getByRole('region', { name: 'Driving arena' });
    await expect(arenaA).toHaveAttribute('data-players', '1');
    await target.goto('/');
    await joinLobby(target, lobby);
    const arenaB = target.getByRole('region', { name: 'Driving arena' });
    await expect(arenaA).toHaveAttribute('data-players', '2');
    await expect(arenaB).toHaveAttribute('data-players', '2');
    const targetId = await arenaB.getAttribute('data-player');
    await expect.poll(async () => (await game(target)).phase, { timeout: 10000 }).toBe('active');
    const originalCores = (await game(target)).cores.map(core => core.id);
    await expect(target.locator('#our-score')).toHaveText('0 / 5 CORES');
    await arenaB.click();
    await target.keyboard.down('w');
    await expect(target.locator('#our-score')).toHaveText('1 / 5 CORES');
    await target.keyboard.up('w');
    await target.keyboard.down('Space');
    await expect.poll(async () => Number(await arenaB.getAttribute('data-speed'))).toBeLessThan(5);
    await target.keyboard.up('Space');
    await expect.poll(async () =>
      (await game(shooter)).players.find(player => player.id === targetId)?.cores,
    ).toBe(1);
    await expect.poll(async () =>
      (await game(target)).players.find(player => player.id === targetId)?.protectionTicks,
    ).toBe(0);

    await arenaA.click();
    await shooter.keyboard.down('f');
    await expect.poll(async () =>
      (await game(target)).players.find(player => player.id === targetId)?.health,
    ).toBeLessThan(100);
    await expect(target.locator('#damage-flash')).toHaveText('Hit by a bullet');
    await expect(target.locator('#damage-flash')).toBeVisible();
    await expect.poll(async () =>
      (await game(target)).players.find(player => player.id === targetId)?.alive,
    ).toBe(false);
    await shooter.keyboard.up('f');
    await expect(target.locator('#our-score')).toHaveText('0 / 5 CORES');
    await expect(target.getByRole('progressbar', { name: 'HEALTH', exact: true })).toHaveAttribute('value', '0');
    await expect(target.locator('#banner')).toContainText('Destroyed');
    const destroyed = await game(target);
    const victim = destroyed.players.find(player => player.id === targetId)!;
    expect(destroyed.cores.some(core =>
      !originalCores.includes(core.id) &&
      Math.hypot(core.x - victim.x, core.y - victim.y) < 60,
    )).toBe(true);
    await expect.poll(async () =>
      (await game(shooter)).players.find(player => player.id === targetId)?.alive,
    ).toBe(false);
    await expect.poll(async () =>
      (await game(target)).players.find(player => player.id === targetId)?.alive,
    ).toBe(true);
    await expect(target.getByRole('progressbar', { name: 'HEALTH', exact: true })).toHaveAttribute('value', '100');
    await expect(target.locator('#banner')).toContainText('Spawn protection');
    await expect(target.locator('#our-score')).toHaveText('0 / 5 CORES');
    await expect(target.getByRole('alert')).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('drive over a separate shield pickup, see it remotely, and let the HUD effect expire', async ({ browser }) => {
  const driverContext = await browser.newContext();
  const otherContext = await browser.newContext();
  try {
    const driver = await driverContext.newPage();
    const other = await otherContext.newPage();
    const errors: string[] = [];
    for (const page of [driver, other]) page.on('pageerror', error => errors.push(error.message));
    await driver.goto('/');
    const lobby = await createLobby(driver);
    const arena = driver.getByRole('region', { name: 'Driving arena' });
    await expect(arena).toHaveAttribute('data-players', '1');
    await other.goto('/');
    await joinLobby(other, lobby);
    await expect(arena).toHaveAttribute('data-players', '2');
    await expect.poll(async () => (await game(driver)).phase, { timeout: 10000 }).toBe('active');
    const initial = await game(driver);
    expect(initial.cores).toHaveLength(3);
    expect(initial.powerUps.map(pickup => pickup.kind)).toEqual(['shield', 'speed', 'disruptor']);
    const driverId = await arena.getAttribute('data-player');
    const shieldId = initial.powerUps.find(pickup => pickup.kind === 'shield')!.id;
    await arena.click();
    await driver.keyboard.down('Space');
    await driver.keyboard.down('w');
    await expect(driver.locator('#power-up-status')).toContainText('Shield', { timeout: 5000 });
    await driver.keyboard.up('w');
    await expect.poll(async () => Number(await arena.getAttribute('data-speed')), { intervals: [20] }).toBeLessThan(1);
    await driver.keyboard.up('Space');
    await expect.poll(async () =>
      (await game(other)).players.find(player => player.id === driverId)!.shieldTicks,
    ).toBeGreaterThan(0);
    expect((await game(other)).powerUps.some(pickup => pickup.id === shieldId)).toBe(false);
    await expect(driver.locator('#our-score')).toHaveText('0 / 5 CORES');
    await expect(driver.locator('#power-up-status')).toHaveText('No active power-ups', { timeout: 10000 });
    await expect.poll(async () =>
      (await game(other)).players.find(player => player.id === driverId)!.shieldTicks,
    ).toBe(0);
    expect(errors).toEqual([]);
    await expect(driver.getByRole('alert')).toBeHidden();
    await expect(other.getByRole('alert')).toBeHidden();
  } finally {
    await driverContext.close();
    await otherContext.close();
  }
});

test('countdown, spectator queue, core expiry and arena HUD with event feed', async ({ page, browser }) => {
  await page.goto('/');
  const lobby = await createLobby(page);
  const arena = page.getByRole('region', { name: 'Driving arena' });
  await expect(arena).toHaveAttribute('data-players', '1');
  await expect(page.locator('#timer-label')).toHaveText('STARTS IN');
  await expect(page.locator('#round-number')).toHaveText('1');
  const name = (await game(page)).players[0].name;
  await expect(page.locator('#our-name')).toHaveText(name);
  await expect(page.locator('#win-total')).toHaveText('0 total wins');
  await arena.click();
  await page.keyboard.down('w');
  expect((await game(page)).cores).toHaveLength(0);
  expect((await game(page)).powerUps).toHaveLength(0);
  expect((await game(page)).players[0].y).toBe(450);
  await page.keyboard.up('w');
  const secondContext = await browser.newContext();
  try {
  const second = await secondContext.newPage();
  await second.goto('/');
  await joinLobby(second, lobby);
  await expect(page.locator('#timer-label')).toHaveText('STARTS IN');
  await expect.poll(async () => (await game(page)).phase, { timeout: 10000 }).toBe('active');
  await expect(page.locator('#timer-label')).toHaveText('TIME LEFT');
  await expect(page.getByRole('log', { name: 'Game events' })).toContainText('started');
  const initial = await game(page);
  expect(initial.cores.length).toBeGreaterThan(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator('#arena-hud > div, #arena-hud, #game, #event-feed, .name-panel').evaluateAll(nodes =>
      nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { id: node.id || node.className, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, cx: rect.x + rect.width / 2 };
      }));
    const box = (id: string) => boxes.find(item => item.id === id)!;
    expect(box('timer-panel').right).toBeLessThan(box('round-panel').x);
    expect(box('round-panel').right).toBeLessThan(box('score-panel').x);
    expect(box('event-feed').right).toBeLessThan(box('power-up-panel').x);
    expect(box('power-up-panel').right).toBeLessThan(box('health-panel').x);
    expect(box('round-panel').bottom).toBeLessThan(box('power-up-panel').y);
    expect(Math.abs(box('round-panel').cx - box('arena-hud').cx)).toBeLessThan(2);
    expect(Math.abs(box('power-up-panel').cx - box('arena-hud').cx)).toBeLessThan(2);
    expect(box('arena-hud').y).toBe(box('game').y);
    expect(box('arena-hud').bottom).toBeLessThanOrEqual(box('game').bottom);
    for (const panel of boxes.filter(item => item.id.endsWith('-panel') && item.id !== 'name-panel')) {
      expect(panel.x).toBeGreaterThanOrEqual(box('arena-hud').x);
      expect(panel.right).toBeLessThanOrEqual(box('arena-hud').right);
      expect(panel.bottom).toBeLessThanOrEqual(box('arena-hud').bottom);
    }
  }
  const observerContext = await browser.newContext();
  try {
    const observer = await observerContext.newPage();
    await observer.goto('/');
    await joinLobby(observer, lobby);
    await expect(observer.locator('#banner')).toContainText('Spectating');
    await expect(observer.locator('#our-score')).toHaveText('QUEUE #1');
    const spectator = (await game(observer)).players.find(player => player.spectator)!;
    expect(spectator.name).not.toBe(name);
    await observer.getByRole('region', { name: 'Driving arena' }).click();
    await observer.keyboard.down('w');
    await observer.keyboard.down('f');
    await expect.poll(async () => (await game(page)).players.length).toBe(3);
    expect((await game(observer)).players.find(player => player.id === spectator.id)!.alive).toBe(false);
    await observer.keyboard.up('w');
    await observer.keyboard.up('f');
    await expect.poll(async () => {
      const current = await game(page);
      return initial.cores.every(core => !current.cores.some(item => item.id === core.id));
    }, { timeout: 20000 }).toBe(true);
    expect((await game(page)).cores.length).toBeGreaterThan(0);
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(observer.getByRole('alert')).toBeHidden();
  } finally {
    await observerContext.close();
  }
  } finally {
    await secondContext.close();
  }
});
