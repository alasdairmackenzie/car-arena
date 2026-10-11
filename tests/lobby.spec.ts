import { expect, test } from '@playwright/test';
import { createLobby, joinLobby } from './lobby';

test('create a lobby with custom settings and join it from another browser', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const host = await contextA.newPage();
    const guest = await contextB.newPage();
    await host.goto('/');
    await expect(host.locator('#lobby-list')).toHaveAttribute('data-state', /ready|error/);
    const name = await createLobby(host, { maxDrivers: 3, bots: false });
    const hostArena = host.getByRole('region', { name: 'Driving arena' });
    await expect(hostArena).toHaveAttribute('data-connected', 'true');
    const room = await hostArena.getAttribute('data-room');

    await guest.goto('/');
    const entry = guest.locator('#lobby-list li', { hasText: name });
    await expect(entry).toContainText('1 / 3 drivers');
    await expect(entry).toContainText('AI off');
    await joinLobby(guest, name);
    const guestArena = guest.getByRole('region', { name: 'Driving arena' });
    await expect(guestArena).toHaveAttribute('data-connected', 'true');
    await expect(guestArena).toHaveAttribute('data-room', room!);
    await expect(guestArena).toHaveAttribute('data-players', '2');
    await expect(guest.locator('#players')).toContainText('2 / 3 drivers');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
