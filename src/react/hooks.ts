import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { IslandMotionAdapter, IslandMotionChannel, IslandMotionHandle } from "../core/motion";
import type { IslandDirection, IslandTheme } from "../core/types";

export const useIsomorphicLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

/** Subscribes safely to `prefers-reduced-motion: reduce`; always `false` during SSR. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return reduced;
}

/**
 * Resolve reading direction (`"ltr"` | `"rtl"`). When `dir === "auto"`, follows
 * the nearest `[dir]` ancestor or `document.documentElement` and reacts live to
 * attribute mutations while staying SSR-safe (`"ltr"` on server).
 */
export function useResolvedDirection(
  dir: IslandDirection = "auto",
  ref?: RefObject<HTMLElement | null>,
): "ltr" | "rtl" {
  const [observed, setObserved] = useState<"ltr" | "rtl">("ltr");

  useIsomorphicLayoutEffect(() => {
    if (dir === "ltr" || dir === "rtl") return;
    if (typeof document === "undefined") return;

    const readDirection = (): "ltr" | "rtl" => {
      const el = ref?.current;
      const scoped = el?.closest("[dir]") as HTMLElement | null;
      const attr = scoped?.getAttribute("dir")?.toLowerCase() ?? document.documentElement.getAttribute("dir")?.toLowerCase();
      if (attr === "rtl") return "rtl";
      if (attr === "ltr") return "ltr";
      const target = el ?? document.documentElement;
      if (typeof getComputedStyle === "function" && target) {
        return getComputedStyle(target).direction === "rtl" ? "rtl" : "ltr";
      }
      return "ltr";
    };

    const sync = () => {
      const next = readDirection();
      setObserved((prev) => (prev === next ? prev : next));
    };

    sync();

    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    const scoped = ref?.current?.closest("[dir]");
    if (scoped && scoped !== document.documentElement) {
      observer.observe(scoped, { attributes: true, attributeFilter: ["dir"] });
    }
    return () => observer.disconnect();
  }, [dir, ref]);

  return dir === "rtl" ? "rtl" : dir === "ltr" ? "ltr" : observed;
}

/**
 * Resolve whether the active surface should use dark or light styling, honoring
 * explicit `theme`, ancestor `[data-island-theme]`, and OS `prefers-color-scheme`.
 */
export function useResolvedDarkTheme(
  theme: IslandTheme = "dark",
  ref?: RefObject<HTMLElement | null>,
): boolean {
  const [isDark, setIsDark] = useState(() => theme !== "light");

  useIsomorphicLayoutEffect(() => {
    if (theme === "dark") {
      setIsDark(true);
      return;
    }
    if (theme === "light") {
      setIsDark(false);
      return;
    }
    if (typeof window === "undefined") return;

    const readSystemDark = () =>
      typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true;

    const readTheme = (): boolean => {
      const ancestor = ref?.current?.closest("[data-island-theme]")?.getAttribute("data-island-theme");
      if (ancestor === "light") return false;
      if (ancestor === "dark") return true;
      return readSystemDark();
    };

    const sync = () => setIsDark(readTheme());
    sync();

    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (!mq) return;
    const onMq = () => sync();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onMq);
      return () => mq.removeEventListener("change", onMq);
    }
    mq.addListener(onMq);
    return () => mq.removeListener(onMq);
  }, [theme, ref]);

  return theme === "dark" ? true : theme === "light" ? false : isDark;
}

interface MotionSlot {
  value: number;
  velocity: number;
  target: number;
  handle: IslandMotionHandle | null;
}

export interface MotionController {
  get: (key: string, fallback?: number) => number;
  setImmediate: (key: string, value: number) => void;
  animateTo: (
    key: string,
    target: number,
    channel: IslandMotionChannel,
    options?: { immediate?: boolean; initialFrom?: number; onComplete?: () => void },
  ) => void;
  isRunning: (key?: string) => boolean;
  stopAll: () => void;
}

/**
 * Manages named 120Hz animated channels driven by a pluggable `IslandMotionAdapter`.
 * Preserves live instantaneous velocity across mid-flight target interruptions
 * and pushes updates via `onFrame` with zero React re-renders per frame.
 */
export function useMotionController(adapter: IslandMotionAdapter, onFrame: () => void): MotionController {
  const slotsRef = useRef(new Map<string, MotionSlot>());
  const adapterRef = useRef(adapter);
  const frameRef = useRef(onFrame);

  adapterRef.current = adapter;
  frameRef.current = onFrame;

  const stopSlot = (slot: MotionSlot) => {
    slot.handle?.stop();
    slot.handle = null;
  };

  const stopAll = useCallback(() => {
    for (const slot of slotsRef.current.values()) stopSlot(slot);
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const get = useCallback((key: string, fallback = 0): number => {
    const existing = slotsRef.current.get(key);
    return existing ? existing.value : fallback;
  }, []);

  const setImmediate = useCallback((key: string, value: number) => {
    let slot = slotsRef.current.get(key);
    if (!slot) {
      slot = { value, velocity: 0, target: value, handle: null };
      slotsRef.current.set(key, slot);
    } else {
      stopSlot(slot);
      slot.value = value;
      slot.target = value;
      slot.velocity = 0;
    }
  }, []);

  const animateTo = useCallback(
    (
      key: string,
      target: number,
      channel: IslandMotionChannel,
      options: { immediate?: boolean; initialFrom?: number; onComplete?: () => void } = {},
    ) => {
      const currentAdapter = adapterRef.current;
      let slot = slotsRef.current.get(key);
      if (!slot) {
        const start = options.initialFrom ?? target;
        slot = { value: start, velocity: 0, target, handle: null };
        slotsRef.current.set(key, slot);
      }

      if (options.immediate || currentAdapter.reduced) {
        stopSlot(slot);
        slot.value = target;
        slot.target = target;
        slot.velocity = 0;
        frameRef.current();
        options.onComplete?.();
        return;
      }

      // Already heading cleanly to this target with negligible delta.
      if (slot.handle && Math.abs(slot.target - target) < 0.05) {
        return;
      }
      if (!slot.handle && Math.abs(slot.value - target) < 0.05 && Math.abs(slot.velocity) < 0.05) {
        slot.value = target;
        slot.target = target;
        slot.velocity = 0;
        frameRef.current();
        options.onComplete?.();
        return;
      }

      stopSlot(slot);
      slot.target = target;
      const activeSlot = slot;
      let completedSync = false;

      const handle = currentAdapter.animate({
        from: activeSlot.value,
        to: target,
        velocity: activeSlot.velocity,
        channel,
        onUpdate(value, velocity) {
          activeSlot.value = value;
          activeSlot.velocity = velocity;
          frameRef.current();
        },
        onComplete() {
          completedSync = true;
          activeSlot.handle = null;
          activeSlot.value = target;
          activeSlot.velocity = 0;
          frameRef.current();
          options.onComplete?.();
        },
      });

      if (!completedSync) {
        activeSlot.handle = handle;
      }
    },
    [],
  );

  const isRunning = useCallback((key?: string) => {
    if (key !== undefined) return Boolean(slotsRef.current.get(key)?.handle);
    for (const slot of slotsRef.current.values()) {
      if (slot.handle) return true;
    }
    return false;
  }, []);

  const controllerRef = useRef<MotionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = { get, setImmediate, animateTo, isRunning, stopAll };
  }
  return controllerRef.current;
}

/**
 * Observes `measureRef` content dimensions and smoothly auto-morphs `outerRef`
 * width and height at 120Hz via the active `IslandMotionAdapter`.
 */
export function useAutoMorph(
  outerRef: RefObject<HTMLElement | null>,
  measureRef: RefObject<HTMLElement | null>,
  adapter: IslandMotionAdapter,
  enabled: boolean,
): void {
  const initializedRef = useRef(false);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const motionRef = useRef<MotionController | null>(null);

  const applyFrame = useCallback(() => {
    const outer = outerRef.current;
    const ctrl = motionRef.current;
    if (!outer || !ctrl) return;
    const wRunning = ctrl.isRunning("w");
    const hRunning = ctrl.isRunning("h");
    if (wRunning || hRunning) {
      outer.style.width = `${Math.max(0, ctrl.get("w")).toFixed(2)}px`;
      outer.style.height = `${Math.max(0, ctrl.get("h")).toFixed(2)}px`;
    } else {
      outer.style.width = "";
      outer.style.height = "";
    }
  }, [outerRef]);

  const motion = useMotionController(adapter, applyFrame);
  motionRef.current = motion;

  useEffect(() => {
    const outer = outerRef.current;
    const inner = measureRef.current;
    if (!enabled || adapter.reduced || typeof ResizeObserver !== "function" || !outer || !inner) {
      motion.stopAll();
      if (outer) {
        outer.style.width = "";
        outer.style.height = "";
      }
      initializedRef.current = false;
      return;
    }

    const syncSize = (innerW: number, innerH: number) => {
      if (innerW <= 0 || innerH <= 0) return;
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(outer) : null;
      const extraW = cs
        ? (parseFloat(cs.paddingLeft) || 0) +
          (parseFloat(cs.paddingRight) || 0) +
          (parseFloat(cs.borderLeftWidth) || 0) +
          (parseFloat(cs.borderRightWidth) || 0)
        : 0;
      const extraH = cs
        ? (parseFloat(cs.paddingTop) || 0) +
          (parseFloat(cs.paddingBottom) || 0) +
          (parseFloat(cs.borderTopWidth) || 0) +
          (parseFloat(cs.borderBottomWidth) || 0)
        : 0;
      let width = innerW + extraW;
      let height = innerH + extraH;
      if (cs) {
        const maxW = parseFloat(cs.maxWidth);
        if (Number.isFinite(maxW) && maxW > 0) width = Math.min(width, maxW);
        const maxH = parseFloat(cs.maxHeight);
        if (Number.isFinite(maxH) && maxH > 0) height = Math.min(height, maxH);
      }
      if (!initializedRef.current) {
        initializedRef.current = true;
        lastSizeRef.current = { width, height };
        motion.setImmediate("w", width);
        motion.setImmediate("h", height);
        return;
      }

      const prev = lastSizeRef.current;
      const dw = Math.abs(width - prev.width);
      const dh = Math.abs(height - prev.height);
      if (dw < 0.4 && dh < 0.4) return;

      lastSizeRef.current = { width, height };
      if (dw >= 0.4) {
        motion.animateTo("w", width, "morph");
      }
      if (dh >= 0.4) {
        const channel: IslandMotionChannel = height >= prev.height ? "expand" : "collapse";
        motion.animateTo("h", height, channel);
      }
    };

    const rect = inner.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      syncSize(rect.width, rect.height);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.borderBoxSize?.[0];
        const w = box ? box.inlineSize : entry.contentRect.width;
        const h = box ? box.blockSize : entry.contentRect.height;
        syncSize(w, h);
      }
    });
    observer.observe(inner);

    return () => {
      observer.disconnect();
      motion.stopAll();
      if (outer) {
        outer.style.width = "";
        outer.style.height = "";
      }
    };
  }, [enabled, adapter, outerRef, measureRef, motion]);
}
