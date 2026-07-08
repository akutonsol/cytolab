import { reveal, type RevealOpts } from './reveal';
import type { Target } from './core';

/** Pure opacity reveal — no translate. For elements that shouldn't shift. */
export function fadeIn(target: Target, opts: RevealOpts = {}): () => void {
  return reveal(target, { y: 0, x: 0, duration: 0.7, ...opts });
}
