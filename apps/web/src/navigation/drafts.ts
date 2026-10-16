import { useCallback, useEffect, useState } from "react";
type Value = string | number;
const drafts = new Map<string, { value: Value; persisted: boolean }>();
const prefix = "agentic-economy:form-draft:v1:";
export const hasMemoryOnlyDrafts = (keyPrefix = "") => [...drafts.entries()].some(([key, entry]) => key.startsWith(keyPrefix) && !entry.persisted);
/** Local draft values only. Never store sessions, eligibility, signing or reviewed state. */
export function useDraftField<T extends Value>(key: string, initial: T) {
  const [state, setState] = useState(() => {
    const cached = drafts.get(key);
    if (cached && typeof cached.value === typeof initial) return { value: cached.value as T, persisted: cached.persisted };
    try {
      const raw = sessionStorage.getItem(prefix + key), parsed: unknown = raw === null ? initial : JSON.parse(raw);
      const value = typeof parsed === typeof initial && (typeof parsed !== "number" || Number.isFinite(parsed)) ? parsed as T : initial;
      return { value, persisted: true };
    } catch { return { value: initial, persisted: false }; }
  });
  const set = useCallback((value: T) => {
    let persisted = false;
    try { sessionStorage.setItem(prefix + key, JSON.stringify(value)); persisted = true; } catch { /* Keep the running-tab draft. */ }
    drafts.set(key, { value, persisted }); setState({ value, persisted });
  }, [key]);
  return [state.value, set, state.persisted] as const;
}
export function useDraftUnloadGuard() {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasMemoryOnlyDrafts()) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
}
