import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // IMPORTANT: initialize synchronously to avoid a first-render "desktop -> mobile" flip.
  // That flip can cause Radix portal components (Sheet/Dialog/etc.) to crash with
  // DOM errors like insertBefore/removeChild in production.
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    // Safari fallback
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
    // @ts-expect-error - legacy API
    else if (typeof mql.addListener === "function") mql.addListener(onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", onChange);
      // @ts-expect-error - legacy API
      else if (typeof mql.removeListener === "function") mql.removeListener(onChange);
    };
  }, []);

  return isMobile;
}
