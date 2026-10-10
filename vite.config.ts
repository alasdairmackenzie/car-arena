import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5197,
    strictPort: true,
    proxy: {
      '/game': {
        target: `http://127.0.0.1:${process.env.GAME_PORT ?? '2567'}`,
        ws: true,
        rewrite: path => path.replace(/^\/game/, ''),
      },
    },
  },
});
