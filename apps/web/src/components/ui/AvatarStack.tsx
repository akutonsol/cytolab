import { cn } from './cn';

export interface StackAvatar {
  src?: string;
  name?: string;
}

interface AvatarStackProps {
  avatars: StackAvatar[];
  /** Max faces to show before collapsing into a "+N" counter. */
  max?: number;
  size?: number;
  className?: string;
}

// Muted, desaturated tones — see Avatar.tsx.
const PALETTE = ['#8595ad', '#93a594', '#c2a18b', '#a896b5', '#7fa8a0', '#c098a0'];

function initials(name?: string) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Overlapping circular avatars with a trailing "+N" counter. */
export function AvatarStack({ avatars, max = 4, size = 28, className }: AvatarStackProps) {
  const shown = avatars.slice(0, max);
  const extra = avatars.length - shown.length;
  const ring = { width: size, height: size, marginLeft: -size * 0.28 } as const;

  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((a, i) => (
        <div
          key={i}
          className="flex items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface-alt text-[10px] font-semibold text-white first:ml-0"
          style={{ ...ring, marginLeft: i === 0 ? 0 : ring.marginLeft, background: a.src ? undefined : PALETTE[i % PALETTE.length] }}
        >
          {a.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.src} alt={a.name ?? ''} className="h-full w-full object-cover" />
          ) : (
            initials(a.name)
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          className="flex items-center justify-center rounded-full border-2 border-surface bg-text text-[10px] font-semibold text-white"
          style={{ ...ring }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
