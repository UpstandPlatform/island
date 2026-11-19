import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { createIslandApi, getDefaultIslandStore, type IslandApi } from "../core/api";
import type { IslandStore } from "../core/store";
import type { IslandHaptic, IslandState, IslandStoreOptions } from "../core/types";
import type { IslandReactToastOptions } from "./types";

const useIsomorphicLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

const IslandStoreContext = createContext<IslandStore | null>(null);

export interface IslandProviderProps extends Omit<IslandStoreOptions, "now" | "timers" | "onHaptic"> {
  /** Use your own store (e.g. one per test or per micro-frontend). Defaults to the shared store behind `island`. */
  store?: IslandStore;
  /** Feedback hint when toasts appear or are swiped away; wire it to e.g. Telegram `HapticFeedback`. */
  onHaptic?: (haptic: IslandHaptic) => void;
  children?: ReactNode;
}

/** Provides the island store to hooks and components. Optional when you use the shared store. */
export function IslandProvider({ store, onHaptic, strategy, maxQueue, durations, children }: IslandProviderProps) {
  const resolved = store ?? getDefaultIslandStore();
  const hapticRef = useRef(onHaptic);
  useIsomorphicLayoutEffect(() => {
    hapticRef.current = onHaptic;
  });
  useIsomorphicLayoutEffect(() => {
    resolved.configure({
      ...(strategy !== undefined && { strategy }),
      ...(maxQueue !== undefined && { maxQueue }),
      ...(durations !== undefined && { durations }),
      onHaptic: (kind) => hapticRef.current?.(kind),
    });
  }, [resolved, strategy, maxQueue, durations]);
  return <IslandStoreContext.Provider value={resolved}>{children}</IslandStoreContext.Provider>;
}

/** The store from the nearest provider, or the shared default store. */
export function useIslandStore(): IslandStore {
  return useContext(IslandStoreContext) ?? getDefaultIslandStore();
}

const identity = (state: IslandState) => state;

/**
 * Subscribe to island state. Pass a selector to re-render only when that slice
 * changes; it must return a stable value (a primitive or a part of the state).
 */
export function useIsland(): IslandState;
export function useIsland<T>(selector: (state: IslandState) => T): T;
export function useIsland<T>(selector: (state: IslandState) => T = identity as (state: IslandState) => T): T {
  const store = useIslandStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getServerSnapshot()),
  );
}

/** Imperative API bound to the store in context. */
export function useIslandApi(): IslandApi<IslandReactToastOptions> {
  const store = useIslandStore();
  return useMemo(() => createIslandApi<IslandReactToastOptions>(() => store), [store]);
}

/** True while a toast owns the island (the island hands over to it). */
export function useIslandToastActive(): boolean {
  return useIsland((state) => state.toast !== null);
}

/** Busy flag and the newest label. */
export function useIslandActivity(): { busy: boolean; label: string | null } {
  const busy = useIsland((state) => state.busy);
  const label = useIsland((state) => state.busyLabel);
  return useMemo(() => ({ busy, label }), [busy, label]);
}

/** Mark the island busy while `active` is true (e.g. `isFetchingNextPage`). */
export function useIslandBusy(active: boolean, label: string | null = null): void {
  const store = useIslandStore();
  useEffect(() => {
    if (!active) return;
    return store.busy(label);
  }, [store, active, label]);
}

/**
 * Publish a value into a named island slot while this component is mounted.
 * The newest mounted publisher wins; `null`/`undefined` publishes nothing.
 * Read it with `useIslandSlotValue(key)`.
 */
export function useIslandSlot<T>(key: string, value: T | null | undefined): void {
  const store = useIslandStore();
  const handle = useRef<ReturnType<IslandStore["setSlot"]> | null>(null);
  const latest = useRef(value);
  const present = value !== null && value !== undefined;
  useIsomorphicLayoutEffect(() => {
    latest.current = value;
    handle.current?.update(value);
  }, [value]);
  useEffect(() => {
    if (!present) return;
    const registration = store.setSlot(key, latest.current);
    handle.current = registration;
    return () => {
      registration.release();
      if (handle.current === registration) handle.current = null;
    };
  }, [store, key, present]);
}

/** Read the newest value published into a slot. */
export function useIslandSlotValue<T>(key: string): T | null {
  return useIsland((state) => (key in state.slots ? (state.slots[key] as T) : null));
}
