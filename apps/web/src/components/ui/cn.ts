import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * This project's `theme.fontSize` adds non-t-shirt keys (`body-sm`, `label-sm`,
 * `headline-md`, `hero`, `stat`, …). tailwind-merge cannot know they are sizes, so
 * it files them under `text-color` — and then a later colour class silently evicts
 * them.
 *
 * That is not hypothetical: `<Th family="reference">` emitted
 * `text-label-sm … text-secondary`, twMerge dropped `text-label-sm`, and the roles
 * and users tables rendered at 16px instead of 12px.
 *
 * Declaring the custom sizes puts them back in the `font-size` group, which does not
 * conflict with `text-color`. Keep this list in sync with `tailwind.config.ts`.
 */
const FONT_SIZES = [
  'display',
  'headline-lg',
  'headline-md',
  'headline-sm',
  'body-lg',
  'body-md',
  'body-sm',
  'label-md',
  'label-sm',
  'hero',
  'h1',
  'h2',
  'h3',
  'title',
  'section',
  'body',
  'small',
  'caption',
  'tiny',
  'label',
  'meta',
  'stat',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
});

/** Merge conditional class names, de-duplicating conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
