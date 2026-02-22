import { useState, useCallback, useEffect, useRef } from "react";

interface UseDirtyGuardOptions {
  /** Message shown in the browser beforeunload prompt */
  message?: string;
}

interface UseDirtyGuardReturn {
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Mark as dirty */
  setDirty: () => void;
  /** Mark as clean (after save or discard) */
  setClean: () => void;
  /** Manually set dirty state */
  setIsDirty: (value: boolean) => void;
  /**
   * Wraps an onOpenChange handler to intercept close when dirty.
   * Returns `true` if user confirmed (or not dirty) — safe to close.
   * Returns `false` if user cancelled.
   */
  guardClose: (requestedOpen: boolean) => boolean;
}

/**
 * Hook to manage dirty/unsaved state with:
 * - Browser beforeunload protection
 * - Close guard for overlays (dialog/sheet)
 */
export function useDirtyGuard(
  options: UseDirtyGuardOptions = {},
): UseDirtyGuardReturn {
  const { message = "Existem alterações não salvas. Deseja sair sem salvar?" } = options;
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const setDirty = useCallback(() => setIsDirty(true), []);
  const setClean = useCallback(() => setIsDirty(false), []);

  // Protect browser close / navigation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      // Legacy browsers
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [message]);

  const guardClose = useCallback(
    (requestedOpen: boolean): boolean => {
      // Opening is always allowed
      if (requestedOpen) return true;
      // Closing while dirty — confirm
      if (isDirtyRef.current) {
        return window.confirm(message);
      }
      return true;
    },
    [message],
  );

  return {
    isDirty,
    setDirty,
    setClean,
    setIsDirty,
    guardClose,
  };
}
