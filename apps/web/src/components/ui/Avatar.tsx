import { cn } from './cn';

interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
  className?: string;
}

const PALETTE = ['#4f7df9', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#2563eb'];

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
