// PROTOTYPE (#10, throwaway): floating variant switcher (prototype skill, UI.md). Dev builds only.
import { useEffect } from 'react';

export type VariantKey = 'a' | 'b' | 'c';

export function PrototypeSwitcher({ variants, current, onChange }: {
  variants: { key: VariantKey; name: string }[];
  current: VariantKey;
  onChange: (k: VariantKey) => void;
}) {
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (d: number) => onChange(variants[(idx + d + variants.length) % variants.length].key);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('switcher')) return null;
  return (
    <div className="proto-switcher" data-testid="prototype-switcher">
      <button onClick={() => go(-1)} aria-label="previous variant">←</button>
      <span>PROTOTYPE · {variants[idx].key.toUpperCase()} ({variants[idx].name})</span>
      <button onClick={() => go(1)} aria-label="next variant">→</button>
    </div>
  );
}
