import { useEffect, useState } from 'preact/hooks';
import type { Settings } from '../../lib/types';

export type ResolvedTheme = 'light' | 'dark';

export function useResolvedTheme(theme: Settings['theme']): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (theme === 'light') return 'light';
  if (theme === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}

/** Apply the resolved theme to the document root as a data attribute. */
export function useThemeClass(theme: Settings['theme']): ResolvedTheme {
  const resolved = useResolvedTheme(theme);
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
  return resolved;
}
