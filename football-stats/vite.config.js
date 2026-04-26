import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/edik/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://api.football-data.org/v4', // Адрес API
        changeOrigin: true, // Изменять Origin заголовок
        rewrite: (path) => path.replace(/^\/api/, ''), // Удаляем префикс /api
      },
    },
  },
});