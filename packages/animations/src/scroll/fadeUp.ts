import { reveal, type RevealOpts } from './reveal';
import type { Target } from './core';

/** Fade + upward translate reveal (the default section entrance). */
export function fadeUp(target: Target, opts: RevealOpts = {}): () => void {
  return reveal(target, { y: 28, ...opts });
}
