import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Прокси /api → Flask (порт по умолчанию 5001). Переопределение: VITE_API_PROXY_TARGET=http://127.0.0.1:5001 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5001').replace(/\/$/, '');

  const apiProxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
  };

  return {
    base: process.env.GITHUB_ACTIONS ? '/edik/' : '/',
    plugins: [react()],
    server: {
      proxy: apiProxy,
    },
    preview: {
      // Без этого `npm run preview` не проксирует /api → Network Error в браузере
      proxy: apiProxy,
    },
  };
});
