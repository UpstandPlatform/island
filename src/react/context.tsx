import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { createIslandApi, getDefaultIslandStore, type IslandApi } from "../core/api";
import { resolveMotionAdapter, type IslandMotionAdapter, type IslandMotionInput } from "../core/motion";
import type { IslandStore } from "../core/store";
import type {
  IslandAutopilot,
  IslandDirection,
  IslandGlassOptions,
  IslandHaptic,
  IslandLayoutState,
  IslandMode,
  IslandPosition,
  IslandState,
  IslandStoreOptions,
  IslandSurface,
  IslandTheme,
  IslandToastStyles,
} from "../core/types";
import { useIsomorphicLayoutEffect, usePrefersReducedMotion, useResolvedDirection } from "./hooks";
import type { IslandReactToastOptions, IslandToastIcons } from "./types";

const IslandStoreContext = createContext<IslandStore | null>(null);

export interface IslandConfig {
  position?: IslandPosition;
  mode?: IslandMode;
  surface?: IslandSurface;
  glass?: IslandGlassOptions;
  motion?: IslandMotionInput;
  dir?: IslandDirection;
  theme?: IslandTheme;
  roundness?: number;
  autopilot?: IslandAutopilot;
  icons?: IslandToastIcons;
  styles?: IslandToastStyles;
}

const IslandConfigContext = createContext<IslandConfig>({});

export interface IslandProviderProps extends Omit<IslandStoreOptions, "now" | "timers" | "onHaptic"> {
  /** Use your own store (e.g. one per test or per micro-frontend). Defaults to the shared store behind `island`. */
  store?: IslandStore;
  /** Feedback hint when toasts appear or are swiped away; wire it to e.g. Telegram `HapticFeedback`. */
  onHaptic?: (haptic: IslandHaptic) => void;
  /** Default Liquid Glass parameters when `surface="liquid-glass"`. */
  glass?: IslandGlassOptions;
  /** Default motion preset (`"bouncy"`, `"smooth"`, `"snappy"`, `"elastic"`, `"gentle"`, `"instant"`) or custom adapter. */
  motion?: IslandMotionInput;
  /** Default corner & gooey fillet roundness in px. Default `16`. */
  roundness?: number;
  /** Default autopilot expand/collapse behavior for toasts with body content. */
  autopilot?: IslandAutopilot;
  /** Default custom icons keyed by toast type. */
  icons?: IslandToastIcons;
  /** Default class name overrides for toast sub-elements. */
  styles?: IslandToastStyles;
  children?: ReactNode;
}

const LAYOUT_KEYS = ["position", "mode", "surface", "dir", "theme"] as const;

/** Provides the island store and visual/motion defaults to hooks and components. */
export function IslandProvider({
  store,
  onHaptic,
  strategy,
  maxQueue,
  durations,
  position,
  mode,
  surface,
  glass,
  motion,
  dir,
  theme,
  roundness,
  autopilot,
  icons,
  styles,
  children,
}: IslandProviderProps) {
  const resolved = store ?? getDefaultIslandStore();
  const hapticRef = useRef(onHaptic);
  const prevLayoutRef = useRef<Partial<IslandLayoutState>>({});

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

  // Sync layout props into store only when a prop changes (including initial mount),
  // so runtime imperative updates (`island.setPosition(...)`) are preserved across re-renders.
  useIsomorphicLayoutEffect(() => {
    const incoming: Partial<IslandLayoutState> = { position, mode, surface, dir, theme };
    const patch: Partial<IslandLayoutState> = {};
    let hasPatch = false;
    for (const key of LAYOUT_KEYS) {
      const value = incoming[key];
      if (value !== undefined && !Object.is(prevLayoutRef.current[key], value)) {
        (patch as Record<string, unknown>)[key] = value;
        (prevLayoutRef.current as Record<string, unknown>)[key] = value;
        hasPatch = true;
      } else if (value === undefined && prevLayoutRef.current[key] !== undefined) {
        delete prevLayoutRef.current[key];
      }
    }
    if (hasPatch) {
      resolved.configure(patch);
    }
  }, [resolved, position, mode, surface, dir, theme]);

  const config = useMemo<IslandConfig>(
    () => ({ position, mode, surface, glass, motion, dir, theme, roundness, autopilot, icons, styles }),
    [position, mode, surface, glass, motion, dir, theme, roundness, autopilot, icons, styles],
  );

  return (
    <IslandStoreContext.Provider value={resolved}>
      <IslandConfigContext.Provider value={config}>{children}</IslandConfigContext.Provider>
    </IslandStoreContext.Provider>
  );
}

/** The store from the nearest provider, or the shared default store. */
export function useIslandStore(): IslandStore {
  return useContext(IslandStoreContext) ?? getDefaultIslandStore();
}

/** Default visual & motion configuration from the nearest `<IslandProvider>`. */
export function useIslandConfig(): IslandConfig {
  return useContext(IslandConfigContext);
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

/** Resolve a layout field cleanly across prop override, store override, and provider default (SSR safe). */
export function useIslandLayoutField<K extends keyof IslandLayoutState>(
  key: K,
  override?: IslandLayoutState[K],
): IslandLayoutState[K] {
  const store = useIslandStore();
  const config = useIslandConfig();
  const storeValue = useIsland((state) => state[key]);
  if (override !== undefined) return override;
  if (store.hasLayoutOverride(key)) return storeValue;
  return (config[key] as IslandLayoutState[K] | undefined) ?? storeValue;
}

/** Read and update the active 6-point island anchor position. */
export function useIslandPosition(): [IslandPosition, (position: IslandPosition) => void] {
  const store = useIslandStore();
  const position = useIslandLayoutField("position");
  const setPosition = useCallback((next: IslandPosition) => store.setPosition(next), [store]);
  return [position, setPosition];
}

/** Read and update the active island mode (`"floating"` | `"dock"`). */
export function useIslandMode(): [IslandMode, (mode: IslandMode) => void] {
  const store = useIslandStore();
  const mode = useIslandLayoutField("mode");
  const setMode = useCallback((next: IslandMode) => store.setMode(next), [store]);
  return [mode, setMode];
}

/** Read and update the active surface style (`"solid"` | `"liquid-glass"`). */
export function useIslandSurface(): [IslandSurface, (surface: IslandSurface) => void] {
  const store = useIslandStore();
  const surface = useIslandLayoutField("surface");
  const setSurface = useCallback((next: IslandSurface) => store.setSurface(next), [store]);
  return [surface, setSurface];
}

/** Read the resolved text direction (`"ltr"` | `"rtl"`), honoring `"auto"` ambient DOM direction. */
export function useIslandDirection(override?: IslandDirection): "ltr" | "rtl" {
  const dir = useIslandLayoutField("dir", override);
  return useResolvedDirection(dir);
}

/** Resolve the active motion adapter from prop, provider default, and `prefers-reduced-motion`. */
export function useIslandMotion(override?: IslandMotionInput): IslandMotionAdapter {
  const config = useIslandConfig();
  const reduced = usePrefersReducedMotion();
  const input = override ?? config.motion;
  return useMemo(() => resolveMotionAdapter(input, reduced), [input, reduced]);
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
