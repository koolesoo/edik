import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Прокси /api → Flask (порт по умолчанию 5001). Переопределение: VITE_API_PROXY_TARGET=http://127.0.0.1:5001 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5001').replace(/\/$/, '');

  /** Capacitor грузит SPA с base '/'; GitHub Pages — /edik/ только если не capacitor-сборка. */
  const isCapacitorBuild = mode === 'capacitor';
  const base = isCapacitorBuild ? '/' : (process.env.GITHUB_ACTIONS ? '/edik/' : '/');

  const apiProxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
  };

  return {
    base,
    plugins: [react()],
    server: {
      // Чтобы открыть dev с iPhone в той же Wi‑Fi сети (запросы /api идут на этот Mac через прокси).
      host: true,
      proxy: apiProxy,
    },
    preview: {
      host: true,
      // Без этого `npm run preview` не проксирует /api → Network Error в браузере
      proxy: apiProxy,
    },
  };
});
