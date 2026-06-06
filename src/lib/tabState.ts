// Per-tab helper state, backed by chrome.storage.session. Each UI helper (text
// spacing, focus order, vision) records whether it is active on a given tab so
// the panel can restore its toggle when the user switches tabs, and so the
// worker can tear the page effect down on navigation, tab close, and panel
// close. The value is `true` for on/off helpers or a mode string for the vision
// simulation; an absent record means off.
//
// This is a thin wrapper over session storage with no side effects at import,
// so it is safe to unit-test (the worker module, which registers listeners on
// import, is not).

export interface PerTabState<T extends string | true> {
  key(tabId: number): string;
  set(tabId: number, value: T | null): Promise<void>;
  get(tabId: number): Promise<T | null>;
  /** Tab ids that currently have this state recorded. */
  activeTabs(): Promise<number[]>;
}

export function perTabState<T extends string | true>(prefix: string): PerTabState<T> {
  const p = `${prefix}:`;
  const key = (tabId: number): string => `${p}${tabId}`;
  return {
    key,
    async set(tabId: number, value: T | null): Promise<void> {
      try {
        if (value == null) await chrome.storage.session.remove(key(tabId));
        else await chrome.storage.session.set({ [key(tabId)]: value });
      } catch {
        /* ignore */
      }
    },
    async get(tabId: number): Promise<T | null> {
      try {
        const got = await chrome.storage.session.get(key(tabId));
        return (got[key(tabId)] ?? null) as T | null;
      } catch {
        return null;
      }
    },
    async activeTabs(): Promise<number[]> {
      try {
        const all = await chrome.storage.session.get(null);
        return Object.keys(all)
          .filter((k) => k.startsWith(p))
          .map((k) => Number(k.slice(p.length)))
          .filter((n) => Number.isInteger(n));
      } catch {
        return [];
      }
    },
  };
}

/**
 * Remove a helper's page effect from every tab that still has it, then clear the
 * records. The teardown callback runs the helper's own revert (an executeScript
 * call in the worker); this function only orchestrates the enumerate / revert /
 * forget loop so it stays unit-testable independent of chrome.scripting.
 */
export async function clearHelperEverywhere<T extends string | true>(
  state: PerTabState<T>,
  teardown: (tabId: number) => void,
): Promise<void> {
  for (const tabId of await state.activeTabs()) {
    teardown(tabId);
    await state.set(tabId, null);
  }
}
