import { cn } from './cn';

interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
  className?: string;
}

// Muted, desaturated tones so initials avatars recede rather than pull focus.
const PALETTE = ['#8595ad', '#93a594', '#c2a18b', '#a896b5', '#7fa8a0', '#c098a0', '#9aa0b3'];

function initials(name?: string) {
  if (!name) return '';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Circular avatar with a colored initials fallback. */
export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: src ? undefined : colorFor(name), fontSize: size * 0.36 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  );
}
