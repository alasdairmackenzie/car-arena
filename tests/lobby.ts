import { expect, type Page } from '@playwright/test';

let counter = 0;

export interface LobbyOptions {
  name?: string;
  maxDrivers?: number;
  bots?: boolean;
}

/** Creates a uniquely named lobby from the pregame menu and returns its name. */
export async function createLobby(page: Page, options: LobbyOptions = {}): Promise<string> {
  const name = options.name ?? `E2E ${++counter}-${Math.random().toString(36).slice(2, 7)}`;
  const form = page.locator('#lobby-create');
  await form.getByLabel('Name').fill(name);
  if (options.maxDrivers) await form.getByLabel('Max drivers').selectOption(String(options.maxDrivers));
  if (options.bots !== undefined) await form.getByLabel('Fill empty driver slots with AI').setChecked(options.bots);
  await page.getByRole('button', { name: 'Create lobby' }).click();
  return name;
}

/** Joins (or spectates) a named lobby from the list, refreshing until it is listed. */
export async function joinLobby(page: Page, name: string): Promise<void> {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const button = page.locator('#lobby-list').getByRole('button', { name: new RegExp(`^(Join|Spectate) ${escaped}$`) });
  await expect(async () => {
    await page.locator('#lobby-refresh').click();
    await expect(button).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await button.click();
}
