/**
 * Program 2 · P2-8B — forward-only keyset cursor navigation (mirrors the backend: no page numbers,
 * no offset). The API yields a single forward `nextCursor`; to support Prev we keep a stack of the
 * cursors we arrived from. Any predicate change RESETS the stack (a cursor is only valid for a fixed
 * ordering+predicate). `null` = the first page's cursor.
 */
import { create } from 'zustand';

interface CursorState {
  predicateKey: string;
  stack: (string | null)[]; // cursors we can go back to
  current: string | null; // the cursor for the page currently shown
  /** Reset when the predicate changes; no-op when unchanged (keeps position on a re-render). */
  syncPredicate: (key: string) => void;
  /** Advance to the next page using the server's nextCursor. */
  next: (nextCursor: string) => void;
  /** Return to the previous page. */
  prev: () => void;
  canPrev: () => boolean;
  reset: () => void;
}

export const useAuditCursorStore = create<CursorState>((set, get) => ({
  predicateKey: '',
  stack: [],
  current: null,
  syncPredicate: (key) => {
    if (get().predicateKey !== key) set({ predicateKey: key, stack: [], current: null });
  },
  next: (nextCursor) => set((s) => ({ stack: [...s.stack, s.current], current: nextCursor })),
  prev: () =>
    set((s) => {
      if (s.stack.length === 0) return s;
      const stack = s.stack.slice(0, -1);
      const current = s.stack[s.stack.length - 1];
      return { stack, current };
    }),
  canPrev: () => get().stack.length > 0,
  reset: () => set({ stack: [], current: null }),
}));
