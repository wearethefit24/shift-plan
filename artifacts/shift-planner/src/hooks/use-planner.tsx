import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { AppState } from '@/lib/shift-model';
import { loadAppState, saveAppState } from '@/lib/storage';

type PlannerContextValue = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  storageError: string | null;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [initialLoad] = useState(() => loadAppState());
  const [state, setState] = useState<AppState>(initialLoad.state);
  const [storageError, setStorageError] = useState<string | null>(
    initialLoad.error ?? null,
  );
  const skipFirstSave = useRef(Boolean(initialLoad.error));

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const error = saveAppState(state);
    setStorageError(error || null);
  }, [state]);

  const value = useMemo(() => ({ state, setState, storageError }), [state, storageError]);
  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error('usePlanner must be used inside PlannerProvider');
  return context;
}
