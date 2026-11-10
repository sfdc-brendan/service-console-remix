import { createContext, useContext } from 'react';

export interface Customer360ContextValue {
  /** Opens Customer 360 for a Contact, Case, or Work Item id. */
  openCustomer: (recordId: string, name?: string | null) => void;
}

export const Customer360Context = createContext<Customer360ContextValue | null>(null);

export function useCustomer360(): Customer360ContextValue {
  const value = useContext(Customer360Context);
  if (!value) {
    throw new Error('useCustomer360 must be used inside Customer360Provider');
  }
  return value;
}
