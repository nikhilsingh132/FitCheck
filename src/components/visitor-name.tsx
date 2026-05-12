"use client";

import * as React from "react";
import {
  getStoredVisitorName,
  setStoredVisitorName,
} from "@/lib/visitor-name";

type VisitorNameContextValue = {
  /** null until hydration finishes OR the user hasn't entered a name yet. */
  name: string | null;
  /** True once we've checked localStorage on the client (i.e. SSR is over). */
  hydrated: boolean;
  /** Update the stored name. Used by the onboarding dialog after a
   *  successful POST to /api/visitors/name. */
  setName: (name: string) => void;
};

const VisitorNameContext = React.createContext<VisitorNameContextValue | null>(
  null,
);

/**
 * Pure state container for the visitor's display name. Reads / writes
 * localStorage and exposes a setter. The blocking first-visit UI lives in
 * the combined <OnboardingDialog> (see providers.tsx) so name + gender can
 * be captured in a single modal instead of two sequential dialogs.
 */
export function VisitorNameProvider({ children }: { children: React.ReactNode }) {
  const [name, setNameState] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setNameState(getStoredVisitorName());
    setHydrated(true);
  }, []);

  const setName = React.useCallback((next: string) => {
    setStoredVisitorName(next);
    setNameState(next);
  }, []);

  const value = React.useMemo<VisitorNameContextValue>(
    () => ({ name, hydrated, setName }),
    [name, hydrated, setName],
  );

  return (
    <VisitorNameContext.Provider value={value}>
      {children}
    </VisitorNameContext.Provider>
  );
}

export function useVisitorName(): VisitorNameContextValue {
  const ctx = React.useContext(VisitorNameContext);
  if (!ctx) {
    throw new Error(
      "useVisitorName must be used within <VisitorNameProvider>",
    );
  }
  return ctx;
}
