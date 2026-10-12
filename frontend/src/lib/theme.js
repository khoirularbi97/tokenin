import { useEffect, useState } from 'react';
import { load, save } from './storage.js';
import { applySystemBars } from './native.js';

export function useTheme() {
  const [theme, setTheme] = useState(() => load('tokenin-theme', 'dark'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#EEF2F8' : '#070B14');
    save('tokenin-theme', theme);
    applySystemBars(theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
