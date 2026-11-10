import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Customer360Sheet } from '@/components/customer/Customer360Sheet';
import {
  Customer360Context,
  type Customer360ContextValue,
} from './customer360Context';

export function Customer360Provider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<{
    recordId: string;
    name: string | null;
  } | null>(null);
  const openCustomer = useCallback(
    (recordId: string, name?: string | null) =>
      setTarget({ recordId, name: name ?? null }),
    []
  );
  const value = useMemo<Customer360ContextValue>(
    () => ({ openCustomer }),
    [openCustomer]
  );
  return (
    <Customer360Context.Provider value={value}>
      {children}
      <Customer360Sheet
        recordId={target?.recordId ?? null}
        name={target?.name ?? null}
        onClose={() => setTarget(null)}
      />
    </Customer360Context.Provider>
  );
}
