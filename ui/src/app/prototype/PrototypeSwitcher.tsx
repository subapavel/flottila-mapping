/*
 * PROTOTYPE (spec #145) — throwaway. The floating variant switcher: ← / → cycle (also with the arrow keys outside a
 * text field). Deliberately not PF-styled, so nobody mistakes it for part of the design under review. Hidden in a
 * production build unless the page was opened with ?variant= (the prototype branch ships it through the jar).
 */
import { useEffect } from 'react';

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const i = variants.findIndex((v) => v.key === current);
  const step = (d: number) => onChange(variants[(i + d + variants.length) % variants.length]!.key);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable], .react-flow, [role="tree"], [role="separator"]') || e.altKey || e.ctrlKey)) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (import.meta.env.PROD && !new URLSearchParams(window.location.search).has('variant')) return null;
  const v = variants[i]!;
  return (
    <div className="proto-switcher" role="group" aria-label="Prototype variant switcher">
      <button type="button" aria-label="Previous variant" onClick={() => step(-1)}>
        ←
      </button>
      <span>
        PROTOTYPE · {v.key} ({v.name})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => step(1)}>
        →
      </button>
    </div>
  );
}
