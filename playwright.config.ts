import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5297' },
  webServer: [
    {
      command: 'tsx tests/server.ts',
      url: 'http://127.0.0.1:2677/health',
      env: { GAME_PORT: '2677' },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev:client -- --port 5297',
      url: 'http://127.0.0.1:5297',
      env: { GAME_PORT: '2677' },
      reuseExistingServer: false,
    },
  ],
});
