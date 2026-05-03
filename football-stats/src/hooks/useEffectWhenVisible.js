import { useEffect, useRef } from 'react';

/**
 * Выполняет колбэк при смене deps только если вкладка видима (не в фоне).
 * Если страница открыта в background — ждёт visibilitychange, затем один раз вызывает.
 *
 * @param {() => void} fn
 * @param {unknown[]} deps
 */
export function useEffectWhenVisible(fn, deps) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (cancelled || document.hidden) return;
      fnRef.current();
    };

    let removeVisListener = null;
    const schedule = () => {
      if (cancelled) return;
      if (!document.hidden) {
        run();
        return;
      }
      const onVis = () => {
        if (cancelled || document.hidden) return;
        document.removeEventListener('visibilitychange', onVis);
        run();
      };
      document.addEventListener('visibilitychange', onVis);
      removeVisListener = () => document.removeEventListener('visibilitychange', onVis);
    };

    schedule();

    return () => {
      cancelled = true;
      if (removeVisListener) removeVisListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps passed explicitly like useEffect
  }, deps);
}
