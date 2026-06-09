"use client";

import { useEffect, useRef } from "react";

/**
 * Map the SYSTEM BACK (Android gesture/button, browser back) to "close this
 * sheet" while a .pk-sheet overlay is open — instead of navigating away from
 * /pocket (M11). One history entry is pushed on mount; popstate → requestClose
 * (the sheet's normal animated dismiss). If the sheet is dismissed any other way
 * (Done / scrim tap / selection), the unmount cleanup consumes the pushed entry
 * with history.back() so the NEXT back press doesn't need a double tap.
 *
 * Used by PortfolioPicker, PeriodPicker and GroupManager. Tab switches are
 * deliberately NOT history-mapped — sheets only.
 */
export function useSheetBack(requestClose: () => void) {
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  useEffect(() => {
    let viaBack = false;
    try {
      window.history.pushState({ pkSheet: true }, "");
    } catch {
      return; // history unavailable — sheet still closes via its own buttons
    }
    const onPop = () => {
      viaBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!viaBack) window.history.back();
    };
  }, []);
}
