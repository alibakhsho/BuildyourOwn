/* =========================================================================
   MODULE: lib/back-stack.js — dialogs the phone's Back button should close.

   Android Back on a dialog should close the dialog, not leave the page
   underneath (and lose what was typed). Dialogs register while mounted;
   App's Back handler asks closeTopDialog() first.
   ========================================================================= */
import { useEffect, useRef } from "react";

const stack = [];

/** Close the most recent open dialog. True if there was one. */
export function closeTopDialog() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** Register a mounted dialog's close handler (also closes on Escape). */
export function useBackClose(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const close = () => ref.current?.();
    const onKey = (e) => e.key === "Escape" && close();
    stack.push(close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stack.lastIndexOf(close);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}
