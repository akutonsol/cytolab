'use client';

import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

// Palette-icon popover: a 2×3 grid of theme swatches. Trigger style is passed in
// so it matches the surrounding nav icon buttons.
export function ThemeSwitcher({ triggerStyle }: { triggerStyle?: React.CSSProperties }) {
  const { currentTheme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button aria-label="Change theme" title="Change theme" onClick={() => setOpen((v) => !v)} style={triggerStyle}>
        <Palette size={18} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 70, width: 244, background: 'var(--color-bg-card, #fff)', border: '1px solid #e6e9f2', borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.14)', padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', marginBottom: 10 }}>Theme</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {themes.map((t) => {
                const active = t.id === currentTheme;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: active ? '1px solid var(--color-primary)' : '1px solid #eef0f4',
                      background: active ? 'var(--color-primary-light, #eef2ff)' : '#fff',
                    }}
                  >
                    <span style={{ position: 'relative', width: 22, height: 22, borderRadius: 999, background: t.color, flexShrink: 0, display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }}>
                      {active && <Check size={13} color="#fff" strokeWidth={3} />}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
