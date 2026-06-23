"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Tracks whether there is in-app history to go "back" to. It counts client-side
 * route changes since the document loaded: the first entry is the page the user
 * landed on, so only once a second route is seen do we know a real previous
 * in-app page exists. A full page reload (new tab, deep link, refresh) remounts
 * this provider and resets the count to zero — exactly when `router.back()`
 * would otherwise leave the app, so the back button falls back to a parent route.
 */
const CanGoBackContext = createContext(false);

export function NavigationHistoryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [canGoBack, setCanGoBack] = useState(false);
  const navCount = useRef(0);

  useEffect(() => {
    navCount.current += 1;
    if (navCount.current > 1) setCanGoBack(true);
  }, [pathname]);

  return <CanGoBackContext.Provider value={canGoBack}>{children}</CanGoBackContext.Provider>;
}

export function useCanGoBack() {
  return useContext(CanGoBackContext);
}
