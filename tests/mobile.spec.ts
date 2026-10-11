import { expect, test } from '@playwright/test';
import { createLobby, joinLobby } from './lobby';

test('mobile touch driving, simultaneous steering, cancellation and rotation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?solo=1');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const arena = page.getByRole('region', { name: 'Driving arena' });
    await expect(arena).toHaveAttribute('data-camera', 'follow');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('slider', { name: 'Steering' })).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByRole('button', { name: 'Handbrake', exact: true })).toHaveCount(0);
    const client = await context.newCDPSession(page);
    const pad = await page.getByRole('slider', { name: 'Steering' }).boundingBox();
    if (!pad) throw new Error('Missing direction pad');
    const touches = [
      { id: 1, x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 },
    ];
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
    await expect.poll(async () => Number(await arena.getAttribute('data-speed'))).toBeGreaterThan(40);
    touches[0].x += 30;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches });
    await expect(page.getByRole('slider', { name: 'Steering' })).toHaveAttribute('aria-valuenow', /[89]\d|100/);
    await expect.poll(async () => Number(await arena.getAttribute('data-angle')), { intervals: [20] }).toBeGreaterThan(-1.3);
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.getByRole('slider', { name: 'Steering' })).toHaveAttribute('aria-valuenow', '0');
    await expect(page.locator('button.pressed')).toHaveCount(0);
    const reversePad = (await page.getByRole('slider', { name: 'Steering' }).boundingBox())!;
    const reverseTouches = [{ id: 3, x: reversePad.x + reversePad.width / 2, y: reversePad.y + reversePad.height * 0.85 }];
    const reverseStart = Number(await arena.getAttribute('data-y'));
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: reverseTouches });
    await expect.poll(async () => Number(await arena.getAttribute('data-y')), { timeout: 10000 })
      .toBeGreaterThan(reverseStart + 30);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(arena).toHaveAttribute('data-camera', 'follow');
    const layout = await page.locator('#game, #touch-controls').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, height: rect.height };
    }));
    expect(layout[0].height).toBeGreaterThan(250);
    expect(layout[1].x).toBeGreaterThan(layout[0].x);
    expect(layout[1].right).toBeLessThan(layout[0].right);
    expect(layout[1].bottom).toBeLessThan(layout[0].bottom);
    for (const panel of ['.power-up-panel', '.health-panel']) {
      const box = (await page.locator(panel).boundingBox())!;
      expect(box.y).toBeGreaterThan(layout[1].bottom);
      expect(box.y + box.height).toBeLessThanOrEqual(layout[0].bottom + 1);
    }
    await page.getByRole('button', { name: 'Game menu', exact: true }).click();
    await expect(page.locator('#controls')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('mobile countdown, replicated touch input and disabled spectator controls', async ({ browser }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desktop = await browser.newContext();
  const spectator = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await mobile.newPage();
    await page.goto('/');
    const lobby = await createLobby(page);
    const arena = page.getByRole('region', { name: 'Driving arena' });
    await expect(arena).toHaveAttribute('data-players', '1');
    await expect(page.getByRole('slider', { name: 'Steering' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#announce')).toContainText('starts in');
    const other = await desktop.newPage();
    await other.goto('/');
    await joinLobby(other, lobby);
    await expect(page.locator('#timer-label')).toHaveText('TIME LEFT', { timeout: 10000 });
    await expect(page.getByRole('slider', { name: 'Steering' })).toHaveAttribute('aria-disabled', 'false');
    const ownId = await arena.getAttribute('data-player');
    const start = Number(await arena.getAttribute('data-y'));
    const client = await mobile.newCDPSession(page);
    const go = await page.getByRole('slider', { name: 'Steering' }).boundingBox();
    if (!go) throw new Error('Missing direction pad');
    const fire = (await page.getByRole('button', { name: 'Fire gun' }).boundingBox())!;
    expect(fire.width).toBeGreaterThanOrEqual(96);
    expect(fire.height).toBeGreaterThanOrEqual(96);
    expect(Math.abs(fire.y + fire.height / 2 - (go.y + go.height / 2))).toBeLessThan(2);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [
        { id: 1, x: go.x + go.width / 2, y: go.y + go.height / 2 },
        { id: 2, x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 },
      ],
    });
    await expect(page.getByRole('button', { name: 'Fire gun' })).toHaveClass(/pressed/);
    await expect.poll(async () => {
      const raw = await other.getByRole('region', { name: 'Driving arena' }).getAttribute('data-state');
      const cars: { id: string; y: number }[] = JSON.parse(raw ?? '[]');
      return cars.find(car => car.id === ownId)?.y ?? start;
    }).toBeLessThan(start - 40);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('button.pressed')).toHaveCount(0);
    const observer = await spectator.newPage();
    await observer.goto('/');
    await joinLobby(observer, lobby);
    await expect(observer.locator('#banner')).toContainText('Spectating');
    await expect(observer.getByRole('slider', { name: 'Steering' })).toHaveAttribute('aria-disabled', 'true');
    await expect(observer.getByRole('region', { name: 'Driving arena' })).toHaveAttribute('data-camera', 'overview');
    await expect(observer.locator('#minimap')).toBeVisible();
    await expect(page.getByRole('alert')).toBeHidden();
  } finally {
    await mobile.close();
    await desktop.close();
    await spectator.close();
  }
});
