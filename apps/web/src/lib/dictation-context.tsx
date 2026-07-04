'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface DictationContextValue {
  isAnyDictationActive: boolean;
  activeDictationId: string | null;
  /** A DictationButton registers its id while listening, or null to clear. */
  setActive: (id: string | null) => void;
}

const Ctx = createContext<DictationContextValue>({
  isAnyDictationActive: false,
  activeDictationId: null,
  setActive: () => {},
});

export function DictationProvider({ children }: { children: ReactNode }) {
  const [activeDictationId, setId] = useState<string | null>(null);
  const setActive = useCallback((id: string | null) => setId(id), []);
  return (
    <Ctx.Provider value={{ isAnyDictationActive: !!activeDictationId, activeDictationId, setActive }}>
      {children}
    </Ctx.Provider>
  );
}

export const useDictationContext = () => useContext(Ctx);
