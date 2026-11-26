import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { buildGooeyPath, computePillX } from "../core/gooey";
import { resolveMotionAdapter, type IslandMotionInput } from "../core/motion";
import {
  getPositionEdges,
  type IslandAutopilot,
  type IslandDirection,
  type IslandGlassOptions,
  type IslandMode,
  type IslandPosition,
  type IslandSurface,
  type IslandTheme,
  type IslandToast,
  type IslandToastAction,
  type IslandToastStyles,
  type IslandToastType,
} from "../core/types";
import {
  useIsland,
  useIslandConfig,
  useIslandDirection,
  useIslandLayoutField,
  useIslandStore,
} from "./context";
import { IslandGlassBackdrop, type IslandGlassBackdropHandle } from "./glass";
import { useIsomorphicLayoutEffect, useMotionController, usePrefersReducedMotion, useResolvedDarkTheme } from "./hooks";
import type { IslandToastEngine, IslandToastEngineProps, IslandToastIcons } from "./types";

export interface IslandToasterProps {
  /** Renderer. Defaults to the 120Hz analytic gooey renderer; pass `sileoEngine` from `@upstand/island/sileo` for sileo. */
  engine?: IslandToastEngine;
  /** Default anchor across 6 viewport spots (`"top-left"`, `"top-center"`, `"top-right"`, `"bottom-left"`, `"bottom-center"`, `"bottom-right"`). */
  position?: IslandPosition;
  /** Presentation mode (`"floating"` | `"dock"`). */
  mode?: IslandMode;
  /** Surface material (`"solid"` | `"liquid-glass"`). */
  surface?: IslandSurface;
  /** Tuning options when `surface="liquid-glass"`. */
  glass?: IslandGlassOptions;
  /** Motion preset or custom `IslandMotionAdapter`. */
  motion?: IslandMotionInput;
  /** Reading direction (`"ltr"`, `"rtl"`, or `"auto"`). */
  dir?: IslandDirection;
  /** Surface palette (`"dark"`, `"light"`, or `"system"`). */
  theme?: IslandTheme;
  /** Corner & concave neck roundness in px. Default `16`. */
  roundness?: number;
  /**
   * CSS length from the vertical viewport edge to the island's outer edge.
   * Defaults to `"0px"` in `"dock"` mode, `calc(env(safe-area-inset-top, 0px) + 0.5rem)`
   * for `top-*`, and `calc(env(safe-area-inset-bottom, 0px) + 0.5rem)` for `bottom-*`.
   */
  inset?: string;
  /** CSS length from the horizontal viewport edge for `*-left` / `*-right` positions. */
  insetX?: string;
  /** Automatic expand & collapse delays for toasts with body content. Default `true`. */
  autopilot?: IslandAutopilot;
  /** Swipe toward the edge to dismiss. Default `true`. */
  swipeToDismiss?: boolean;
  /** Accessible label for a close button (none when omitted; the package ships no strings). */
  closeLabel?: string;
  /** Custom semantic icon overrides keyed by toast type. */
  icons?: IslandToastIcons;
  /** Custom class names for built-in toast sub-elements. */
  styles?: IslandToastStyles;
}

const DEFAULT_TOP_INSET = "calc(env(safe-area-inset-top, 0px) + 0.5rem)";
const DEFAULT_BOTTOM_INSET = "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)";
const DEFAULT_HORIZONTAL_INSET = "calc(env(safe-area-inset-left, 0px) + 0.75rem)";

function plainText(toast: IslandToast) {
  return [toast.title, typeof toast.description === "string" ? toast.description : null].filter(Boolean).join(". ");
}

function mergeStyles(base?: IslandToastStyles, override?: IslandToastStyles): IslandToastStyles | undefined {
  if (!base && !override) return undefined;
  return { ...base, ...override };
}

/** Mounts the toast renderer and screen-reader announcements. Render it once. */
export function IslandToaster({
  engine: Engine = DefaultIslandToastEngine,
  position: positionProp,
  mode: modeProp,
  surface: surfaceProp,
  glass: glassProp,
  motion: motionProp,
  dir: dirProp,
  theme: themeProp,
  roundness: roundnessProp,
  inset,
  insetX,
  autopilot: autopilotProp,
  swipeToDismiss = true,
  closeLabel,
  icons,
  styles: stylesProp,
}: IslandToasterProps) {
  const store = useIslandStore();
  const config = useIslandConfig();
  const toast = useIsland((state) => state.toast);
  const reducedMotion = usePrefersReducedMotion();

  const basePosition = useIslandLayoutField("position", positionProp);
  const baseSurface = useIslandLayoutField("surface", surfaceProp);
  const mode = useIslandLayoutField("mode", modeProp);
  const theme = useIslandLayoutField("theme", themeProp);
  const dir = useIslandDirection(dirProp);

  const effectivePosition = toast?.position ?? basePosition;
  const effectiveSurface = toast?.surface ?? baseSurface;
  const effectiveGlass = toast?.glass ?? glassProp ?? config.glass;
  const effectiveRoundness = toast?.roundness ?? roundnessProp ?? config.roundness ?? 16;
  const effectiveAutopilot = toast?.autopilot ?? autopilotProp ?? config.autopilot ?? true;
  const motion = useMemo(
    () => resolveMotionAdapter(toast?.motion ?? motionProp ?? config.motion, reducedMotion),
    [toast?.motion, motionProp, config.motion, reducedMotion],
  );
  const effectiveIcons = icons ?? config.icons;
  const effectiveStyles = useMemo(
    () => mergeStyles(mergeStyles(config.styles, stylesProp), toast?.styles),
    [config.styles, stylesProp, toast?.styles],
  );

  const edges = getPositionEdges(effectivePosition);
  const resolvedInset =
    inset ?? (mode === "dock" ? "0px" : edges.vertical === "bottom" ? DEFAULT_BOTTOM_INSET : DEFAULT_TOP_INSET);
  const resolvedInsetX = insetX ?? DEFAULT_HORIZONTAL_INSET;
  const announces = Engine.announces ?? "none";

  // Live regions exist before content arrives, so screen readers pick up changes.
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const toastId = toast?.id;
  const version = toast?.version;
  useEffect(() => {
    if (!toast) {
      setPolite("");
      setAssertive("");
      return;
    }
    const urgent = toast.important ?? toast.type === "error";
    const text = plainText(toast);
    if (urgent && announces !== "all") {
      setPolite("");
      setAssertive(text);
    } else if (!urgent && announces === "none") {
      setAssertive("");
      setPolite(text);
    }
    // Announce on id/version changes only, not on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastId, version, announces]);

  return (
    <>
      <Engine
        toast={toast}
        store={store}
        position={effectivePosition}
        mode={mode}
        surface={effectiveSurface}
        glass={effectiveGlass}
        motion={motion}
        dir={dir}
        theme={theme}
        roundness={effectiveRoundness}
        inset={resolvedInset}
        insetX={resolvedInsetX}
        autopilot={effectiveAutopilot}
        swipeToDismiss={swipeToDismiss}
        closeLabel={closeLabel}
        icons={effectiveIcons}
        styles={effectiveStyles}
      />
      <div data-island-sr="" aria-live="polite" aria-atomic="true">{polite}</div>
      <div data-island-sr="" aria-live="assertive" aria-atomic="true">{assertive}</div>
    </>
  );
}

/** Fallbacks for `--island-height` / `--island-toast-max-width` before the probe is measured (SSR, tests). */
const DEFAULT_PILL_HEIGHT = 40;
const DEFAULT_TOAST_WIDTH = 352;
const DEFAULT_PILL_WIDTH = 176;
const MIN_EXPANDED_BODY = 52;
const DEFAULT_AUTO_EXPAND_MS = 150;
const DEFAULT_AUTO_COLLAPSE_BEFORE_END_MS = 2000;
const SWAP_COLLAPSE_DELAY_MS = 180;
const HEADER_EXIT_MS = 380;
const SWIPE_DISMISS_PX = 28;
const SWIPE_VELOCITY_PX_S = 350;
const SWIPE_MAX_PX = 24;

interface HeaderLayer {
  key: string;
  type: IslandToastType;
  title?: string;
  icon?: ReactNode;
}

function headerKeyOf(t: IslandToast): string {
  return `${t.type}:${t.title ?? ""}`;
}

function hasToastBody(t: IslandToast | null): boolean {
  if (!t) return false;
  const body = (t.content as ReactNode) ?? (t.description as ReactNode);
  return (body !== undefined && body !== null && body !== "") || Boolean(t.action);
}

function isPureCustomToast(t: IslandToast | null): boolean {
  return Boolean(t && t.type === "custom" && !t.title && t.icon === undefined);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function resolveAutopilotDelays(
  autopilot: IslandAutopilot,
  duration: number | null,
): { expandMs: number | null; collapseMs: number | null } {
  if (autopilot === false) return { expandMs: null, collapseMs: null };
  const cfg = typeof autopilot === "object" ? autopilot : {};
  const rawExpand = Math.max(0, cfg.expand ?? DEFAULT_AUTO_EXPAND_MS);

  if (duration === null || duration <= 0) {
    const collapseMs = cfg.collapse !== undefined && cfg.collapse > 0 ? cfg.collapse : null;
    return { expandMs: rawExpand, collapseMs };
  }

  const expandMs = Math.min(rawExpand, duration);
  const defaultCollapse =
    duration > DEFAULT_AUTO_COLLAPSE_BEFORE_END_MS + DEFAULT_AUTO_EXPAND_MS
      ? duration - DEFAULT_AUTO_COLLAPSE_BEFORE_END_MS
      : null;
  const rawCollapse = cfg.collapse !== undefined ? (cfg.collapse > 0 ? cfg.collapse : null) : defaultCollapse;
  const collapseMs = rawCollapse !== null ? clamp(rawCollapse, expandMs, duration) : null;
  return { expandMs, collapseMs };
}

/**
 * Built-in renderer: refresh-rate physics-driven analytic gooey silhouette with
 * solid and live Liquid Glass surfaces, autopilot, fade/slide crossfade headers,
 * upward/downward expansion across 6 positions, dock mode, and full RTL support.
 */
export const DefaultIslandToastEngine: IslandToastEngine = function DefaultIslandToastEngine({
  toast,
  store,
  position,
  mode,
  surface,
  glass,
  motion,
  dir,
  theme,
  roundness,
  inset,
  insetX,
  autopilot,
  swipeToDismiss,
  closeLabel,
  icons,
  styles,
}: IslandToastEngineProps) {
  const config = useIslandConfig();
  const explicitTheme = config.theme !== undefined || store.hasLayoutOverride("theme");
  const toasterRef = useRef<HTMLDivElement>(null);
  const toastElRef = useRef<HTMLDivElement>(null);
  const solidSvgRef = useRef<SVGSVGElement>(null);
  const solidPathRef = useRef<SVGPathElement>(null);
  const glassRef = useRef<IslandGlassBackdropHandle>(null);
  const headerWrapRef = useRef<HTMLDivElement>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const bodyClipRef = useRef<HTMLDivElement>(null);
  const bodyInnerRef = useRef<HTMLDivElement>(null);
  const customMeasureRef = useRef<HTMLDivElement>(null);
  const toastBodyId = useId();

  const isDark = useResolvedDarkTheme(explicitTheme ? theme : "system", toasterRef);
  const edges = getPositionEdges(position);
  const expandDownward = edges.expandsDownward;
  const dockedEdge = mode === "dock" ? edges.vertical : null;

  const [shown, setShown] = useState<IslandToast | null>(toast);
  const [leaving, setLeaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [prevHeader, setPrevHeader] = useState<HeaderLayer | null>(null);

  const shownRef = useRef<IslandToast | null>(toast);
  const initializedRef = useRef(false);
  const expandedRef = useRef(false);
  const leavingRef = useRef(false);
  const hoveredRef = useRef(false);
  const manualExpandedRef = useRef(false);
  const pausedBySelfRef = useRef(false);
  const headerSnapshotRef = useRef<HeaderLayer | null>(
    toast ? { key: headerKeyOf(toast), type: toast.type, title: toast.title, icon: toast.icon as ReactNode } : null,
  );

  // Geometry follows the same CSS tokens as <Island> (`--island-height`,
  // `--island-toast-max-width`) so the toast pill and the island bar match.
  const geometryProbeRef = useRef<HTMLSpanElement>(null);
  const pillHRef = useRef(DEFAULT_PILL_HEIGHT);
  const maxToastWRef = useRef(DEFAULT_TOAST_WIDTH);
  const toastWidthRef = useRef(DEFAULT_TOAST_WIDTH);
  const measuredPillWRef = useRef(DEFAULT_PILL_WIDTH);
  const measuredBodyHRef = useRef(0);
  const measuredCustomHRef = useRef(DEFAULT_PILL_HEIGHT);
  const hasMeasuredPillRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);
  const ignoreNextClickRef = useRef(false);
  const ignoreNextClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timersRef = useRef<{
    exit?: ReturnType<typeof setTimeout>;
    expand?: ReturnType<typeof setTimeout>;
    collapse?: ReturnType<typeof setTimeout>;
    swap?: ReturnType<typeof setTimeout>;
    headerExit?: ReturnType<typeof setTimeout>;
  }>({});

  const clearTimers = useCallback((...keys: (keyof typeof timersRef.current)[]) => {
    for (const k of keys) {
      const t = timersRef.current[k];
      if (t !== undefined) clearTimeout(t);
      delete timersRef.current[k];
    }
  }, []);

  useEffect(() => () => {
    clearTimers("exit", "expand", "collapse", "swap", "headerExit");
    if (dragFrameRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(dragFrameRef.current);
    }
    if (ignoreNextClickTimerRef.current !== null) clearTimeout(ignoreNextClickTimerRef.current);
  }, [clearTimers]);

  // Ref snapshot used inside the 120Hz frame callback so it never reads stale closures.
  const layoutPropsRef = useRef({
    horizontal: edges.horizontal,
    expandDownward,
    dockedEdge,
    roundness,
    surface,
    isCustom: isPureCustomToast(shown),
  });
  layoutPropsRef.current = {
    horizontal: edges.horizontal,
    expandDownward,
    dockedEdge,
    roundness,
    surface,
    isCustom: isPureCustomToast(shown),
  };

  const motionCtrlRef = useRef<ReturnType<typeof useMotionController> | null>(null);

  const applyFrame = useCallback(() => {
    const ctrl = motionCtrlRef.current;
    const toastEl = toastElRef.current;
    if (!ctrl || !toastEl) return;

    const { horizontal, expandDownward: down, dockedEdge: dockEdge, roundness: r, surface: surf, isCustom } =
      layoutPropsRef.current;

    const w = toastWidthRef.current;
    const entry = ctrl.get("entry", 1);
    const entryClamped = clamp(entry, 0, 1);
    const bodyH = Math.max(0, ctrl.get("bodyHeight", 0));
    const pillW = clamp(ctrl.get("pillWidth", isCustom ? w : measuredPillWRef.current), pillHRef.current, w);
    const pillX = clamp(
      ctrl.get("pillX", computePillX(w, pillW, horizontal)),
      0,
      Math.max(0, w - pillW),
    );
    const shift = ctrl.get("headerShift", 0);
    const dragY = ctrl.get("dragY", 0);

    const totalH = pillHRef.current + bodyH;
    const pillTop = down ? 0 : bodyH;
    const slideDist = down ? -6 : 6;
    const entrySlideY = slideDist * (1 - entry);
    const entryScale = 0.95 + 0.05 * entry;
    const headerShiftY = (down ? 2.5 : -2.5) * shift;
    const headerScale = 1 - 0.06 * shift;

    const path = buildGooeyPath({
      width: w,
      pillHeight: pillHRef.current,
      pillX,
      pillWidth: pillW,
      bodyHeight: bodyH,
      roundness: r,
      expandDownward: down,
      dockedEdge: dockEdge,
    });

    toastEl.style.width = `${w.toFixed(2)}px`;
    toastEl.style.height = `${totalH.toFixed(2)}px`;
    toastEl.style.transform = `translate3d(0, ${(entrySlideY + dragY).toFixed(2)}px, 0) scale(${entryScale.toFixed(4)})`;

    if (surf === "liquid-glass") {
      toastEl.style.opacity = "";
      glassRef.current?.updateGooey(path, w, totalH);
      glassRef.current?.setReveal(entryClamped);
    } else {
      toastEl.style.opacity = entryClamped.toFixed(4);
      const svg = solidSvgRef.current;
      if (svg) svg.setAttribute("viewBox", `0 0 ${w.toFixed(2)} ${totalH.toFixed(2)}`);
      solidPathRef.current?.setAttribute("d", path);
    }

    const headerWrap = headerWrapRef.current;
    if (headerWrap) {
      headerWrap.style.left = `${pillX.toFixed(2)}px`;
      headerWrap.style.top = `${pillTop.toFixed(2)}px`;
      headerWrap.style.width = `${pillW.toFixed(2)}px`;
      headerWrap.style.transform = `translate3d(0, ${headerShiftY.toFixed(2)}px, 0) scale(${headerScale.toFixed(4)})`;
      if (surf === "liquid-glass") headerWrap.style.opacity = entryClamped.toFixed(4);
      else headerWrap.style.opacity = "";
    }

    const bodyClip = bodyClipRef.current;
    if (bodyClip) {
      bodyClip.style.clipPath = path ? `path("${path}")` : "";
      if (surf === "liquid-glass") bodyClip.style.opacity = entryClamped.toFixed(4);
      else bodyClip.style.opacity = "";
    }
  }, []);

  const motionCtrl = useMotionController(motion, applyFrame);
  motionCtrlRef.current = motionCtrl;

  const pause = useCallback(() => {
    if (pausedBySelfRef.current) return;
    pausedBySelfRef.current = true;
    store.pause();
  }, [store]);

  const resume = useCallback(() => {
    if (!pausedBySelfRef.current) return;
    pausedBySelfRef.current = false;
    store.resume();
  }, [store]);

  useEffect(
    () => () => {
      if (pausedBySelfRef.current) {
        pausedBySelfRef.current = false;
        store.resume();
      }
    },
    [store],
  );

  const setExpandedState = useCallback(
    (next: boolean, immediate = false) => {
      const current = shownRef.current;
      const custom = isPureCustomToast(current);
      const canExpand = Boolean(current && !leavingRef.current && (custom || (hasToastBody(current) && current.type !== "loading")));
      const resolved = custom ? !leavingRef.current : next && canExpand;

      if (expandedRef.current !== resolved) {
        expandedRef.current = resolved;
        setExpanded(resolved);
      }

      const maxBody =
        typeof window !== "undefined" ? Math.max(MIN_EXPANDED_BODY, window.innerHeight - pillHRef.current - 56) : Infinity;
      const clampedBody = Math.min(measuredBodyHRef.current, maxBody);
      const targetBody = resolved
        ? custom
          ? Math.max(0, measuredCustomHRef.current - pillHRef.current)
          : Math.max(MIN_EXPANDED_BODY, clampedBody)
        : 0;
      const channel = resolved ? "expand" : "collapse";
      motionCtrl.animateTo("bodyHeight", targetBody, channel, { immediate });
      motionCtrl.animateTo("headerShift", resolved && !custom ? 1 : 0, channel, { immediate });
    },
    [motionCtrl],
  );

  const scheduleAutopilot = useCallback(
    (target: IslandToast | null) => {
      clearTimers("expand", "collapse");
      if (!target || leavingRef.current) return;
      if (isPureCustomToast(target)) {
        setExpandedState(true);
        return;
      }
      if (!hasToastBody(target) || target.type === "loading") {
        setExpandedState(false);
        return;
      }
      if (hoveredRef.current || manualExpandedRef.current) return;

      const { expandMs, collapseMs } = resolveAutopilotDelays(autopilot, target.duration);
      if (expandMs === null) {
        setExpandedState(false);
        return;
      }
      if (expandMs <= 0) {
        setExpandedState(true);
      } else {
        timersRef.current.expand = setTimeout(() => {
          delete timersRef.current.expand;
          if (!leavingRef.current && shownRef.current?.id === target.id) {
            setExpandedState(true);
          }
        }, expandMs);
      }
      if (collapseMs !== null) {
        timersRef.current.collapse = setTimeout(() => {
          delete timersRef.current.collapse;
          if (!hoveredRef.current && !manualExpandedRef.current) {
            setExpandedState(false);
          }
        }, collapseMs);
      }
    },
    [autopilot, clearTimers, setExpandedState],
  );

  const applyToastView = useCallback(
    (next: IslandToast) => {
      const prevLayer = headerSnapshotRef.current;
      const nextKey = headerKeyOf(next);
      const nextLayer: HeaderLayer = {
        key: nextKey,
        type: next.type,
        title: next.title,
        icon: next.icon as ReactNode,
      };
      const headerChanged = Boolean(prevLayer && prevLayer.key !== nextKey && !isPureCustomToast(next));
      headerSnapshotRef.current = nextLayer;

      if (headerChanged && prevLayer && !motion.reduced) {
        clearTimers("headerExit");
        setPrevHeader(prevLayer);
        timersRef.current.headerExit = setTimeout(() => {
          delete timersRef.current.headerExit;
          setPrevHeader(null);
        }, HEADER_EXIT_MS);
      } else {
        clearTimers("headerExit");
        setPrevHeader(null);
      }

      shownRef.current = next;
      manualExpandedRef.current = false;
      setShown(next);

      if (isPureCustomToast(next)) {
        motionCtrl.animateTo("pillWidth", toastWidthRef.current, "morph");
        motionCtrl.animateTo("pillX", 0, "morph");
      }

      scheduleAutopilot(next);
    },
    [clearTimers, motion.reduced, motionCtrl, scheduleAutopilot],
  );

  // Sync incoming store `toast` transitions (enter, exit, collapse-before-swap morph).
  useEffect(() => {
    clearTimers("exit", "swap");

    const isInitialMount = !initializedRef.current;
    initializedRef.current = true;

    if (!toast) {
      if (!shownRef.current) return;
      leavingRef.current = true;
      setLeaving(true);
      resume();
      setExpandedState(false);
      motionCtrl.animateTo("entry", 0, "exit");
      const exitMs = motion.reduced ? 0 : (motion.css?.exitMs ?? 460);
      timersRef.current.exit = setTimeout(() => {
        delete timersRef.current.exit;
        shownRef.current = null;
        headerSnapshotRef.current = null;
        hasMeasuredPillRef.current = false;
        leavingRef.current = false;
        expandedRef.current = false;
        hoveredRef.current = false;
        manualExpandedRef.current = false;
        setExpanded(false);
        setLeaving(false);
        setPrevHeader(null);
        setShown(null);
      }, exitMs);
      return;
    }

    const wasEmpty = isInitialMount || !shownRef.current;
    leavingRef.current = false;
    setLeaving(false);

    if (wasEmpty) {
      hasMeasuredPillRef.current = false;
      headerSnapshotRef.current = {
        key: headerKeyOf(toast),
        type: toast.type,
        title: toast.title,
        icon: toast.icon as ReactNode,
      };
      shownRef.current = toast;
      setShown(toast);
      motionCtrl.setImmediate("bodyHeight", 0);
      motionCtrl.setImmediate("headerShift", 0);
      motionCtrl.setImmediate("dragY", 0);
      motionCtrl.animateTo("entry", 1, "enter", { initialFrom: 0 });
      scheduleAutopilot(toast);
      return;
    }

    motionCtrl.animateTo("entry", 1, "enter");

    // Same toast revision? Still refresh autopilot/state cleanly.
    const current = shownRef.current;
    if (current && current.id === toast.id && current.version === toast.version) {
      return;
    }

    if (expandedRef.current && !motion.reduced && !isPureCustomToast(toast)) {
      clearTimers("expand", "collapse");
      manualExpandedRef.current = false;
      setExpandedState(false);
      timersRef.current.swap = setTimeout(() => {
        delete timersRef.current.swap;
        applyToastView(toast);
      }, SWAP_COLLAPSE_DELAY_MS);
    } else {
      applyToastView(toast);
    }
  }, [toast, clearTimers, motion.reduced, motion.css?.exitMs, motionCtrl, resume, setExpandedState, scheduleAutopilot, applyToastView]);

  // Clamp toast width cleanly to host container / viewport width so SVG coordinates always match 1:1.
  const hasShownToast = Boolean(shown);
  useIsomorphicLayoutEffect(() => {
    if (!hasShownToast || typeof window === "undefined") return;
    const syncWidth = () => {
      const toasterEl = toasterRef.current;
      const parentW = toasterEl?.parentElement?.clientWidth ?? 0;
      const hostW =
        edges.horizontal === "center" && toasterEl && toasterEl.clientWidth > 0
          ? toasterEl.clientWidth
          : parentW > 0
            ? Math.min(parentW, window.innerWidth)
            : window.innerWidth;
      const probe = geometryProbeRef.current?.getBoundingClientRect();
      const nextPillH = probe && probe.height > 0 ? probe.height : pillHRef.current;
      if (probe && probe.width > 0) maxToastWRef.current = probe.width;
      const pillHChanged = Math.abs(nextPillH - pillHRef.current) >= 0.5;
      pillHRef.current = nextPillH;
      const nextW = Math.max(nextPillH * 3, Math.min(maxToastWRef.current, hostW - 20));
      if (pillHChanged || Math.abs(nextW - toastWidthRef.current) >= 1) {
        toastWidthRef.current = nextW;
        const targetPillW = isPureCustomToast(shownRef.current)
          ? nextW
          : clamp(measuredPillWRef.current, pillHRef.current, nextW);
        const targetPillX = computePillX(nextW, targetPillW, edges.horizontal);
        motionCtrl.animateTo("pillWidth", targetPillW, "morph", { immediate: true });
        motionCtrl.animateTo("pillX", targetPillX, "morph", { immediate: true });
        applyFrame();
      }
    };
    syncWidth();
    window.addEventListener("resize", syncWidth);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(syncWidth) : null;
    if (ro && toasterRef.current) {
      ro.observe(toasterRef.current);
      if (toasterRef.current.parentElement) ro.observe(toasterRef.current.parentElement);
      if (geometryProbeRef.current) ro.observe(geometryProbeRef.current);
    }
    return () => {
      window.removeEventListener("resize", syncWidth);
      ro?.disconnect();
    };
  }, [hasShownToast, applyFrame, edges.horizontal, motionCtrl]);

  // Re-align pillX cleanly whenever position horizontal anchor changes live.
  useEffect(() => {
    if (!shownRef.current) return;
    const pillW = isPureCustomToast(shownRef.current)
      ? toastWidthRef.current
      : clamp(measuredPillWRef.current, pillHRef.current, toastWidthRef.current);
    const targetX = computePillX(toastWidthRef.current, pillW, edges.horizontal);
    motionCtrl.animateTo("pillWidth", pillW, "morph", { immediate: !hasMeasuredPillRef.current });
    motionCtrl.animateTo("pillX", targetX, "morph", { immediate: !hasMeasuredPillRef.current });
    applyFrame();
  }, [applyFrame, edges.horizontal, mode, roundness, surface, expandDownward, motionCtrl]);

  // Observe header inner width + body/custom inner height via ResizeObserver.
  useEffect(() => {
    if (!shown || typeof ResizeObserver !== "function") return;
    const observers: ResizeObserver[] = [];

    const headerEl = headerInnerRef.current;
    if (headerEl) {
      const syncHeader = (w: number) => {
        if (w <= 0) return;
        const measured = clamp(Math.ceil(w) + 10, pillHRef.current, toastWidthRef.current);
        const first = !hasMeasuredPillRef.current;
        hasMeasuredPillRef.current = true;
        measuredPillWRef.current = measured;
        const targetX = computePillX(toastWidthRef.current, measured, layoutPropsRef.current.horizontal);
        motionCtrl.animateTo("pillWidth", measured, "morph", { immediate: first });
        motionCtrl.animateTo("pillX", targetX, "morph", { immediate: first });
      };
      syncHeader(headerEl.getBoundingClientRect().width);
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          syncHeader(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
        }
      });
      ro.observe(headerEl);
      observers.push(ro);
    }

    const bodyEl = bodyInnerRef.current;
    if (bodyEl) {
      const syncBody = (h: number) => {
        if (h <= 0) return;
        measuredBodyHRef.current = h;
        if (expandedRef.current && !isPureCustomToast(shownRef.current)) {
          const maxBody =
            typeof window !== "undefined" ? Math.max(MIN_EXPANDED_BODY, window.innerHeight - pillHRef.current - 56) : Infinity;
          motionCtrl.animateTo("bodyHeight", Math.max(MIN_EXPANDED_BODY, Math.min(h, maxBody)), "expand");
        }
      };
      syncBody(bodyEl.getBoundingClientRect().height);
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          syncBody(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        }
      });
      ro.observe(bodyEl);
      observers.push(ro);
    }

    const customEl = customMeasureRef.current;
    if (customEl) {
      const syncCustom = (h: number) => {
        if (h <= 0) return;
        measuredCustomHRef.current = h;
        if (isPureCustomToast(shownRef.current) && !leavingRef.current) {
          motionCtrl.animateTo("bodyHeight", Math.max(0, h - pillHRef.current), "expand");
        }
      };
      syncCustom(customEl.getBoundingClientRect().height);
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          syncCustom(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        }
      });
      ro.observe(customEl);
      observers.push(ro);
    }

    return () => {
      for (const ro of observers) ro.disconnect();
    };
  }, [shown, motionCtrl]);

  useIsomorphicLayoutEffect(() => {
    if (shown) applyFrame();
  });

  // Swipe-to-dismiss gesture with velocity tracking and spring snap-back.
  const dragRef = useRef<{
    startY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    delta: number;
    moved: boolean;
    startedOnHeader: boolean;
    pointerId: number;
  } | null>(null);
  const towardEdge = expandDownward ? -1 : 1;

  const pureCustom = shown ? isPureCustomToast(shown) : false;
  const initialW = toastWidthRef.current;
  const initialPillW = pureCustom ? initialW : clamp(measuredPillWRef.current, pillHRef.current, initialW);
  const initialPillX = computePillX(initialW, initialPillW, edges.horizontal);
  const initialBodyH = pureCustom ? Math.max(0, measuredCustomHRef.current - pillHRef.current) : 0;

  // Freeze initial JSX geometry per toast instance so React re-renders (expanded, prevHeader, theme)
  // never overwrite live imperative SVG / clipPath / header positioning written by `applyFrame`.
  // Kept before `!shown` early return so hook order remains constant across empty <-> open transitions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mountGeom = useMemo(
    () => ({
      w: initialW,
      h: pillHRef.current + initialBodyH,
      pillX: initialPillX,
      pillW: initialPillW,
      path: shown
        ? buildGooeyPath({
            width: initialW,
            pillHeight: pillHRef.current,
            pillX: initialPillX,
            pillWidth: initialPillW,
            bodyHeight: initialBodyH,
            roundness,
            expandDownward,
            dockedEdge,
          })
        : "",
    }),
    [shown?.id, surface],
  );

  if (!shown) return null;

  const dismissible = shown.dismissible !== false;
  const bodyNode: ReactNode = (shown.content as ReactNode) ?? (shown.description as ReactNode);
  const hasBody = hasToastBody(shown);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeToDismiss || !dismissible || leaving) return;
    if ((event.target as HTMLElement).closest("button,a,input,textarea,select")) return;
    const now = performance.now();
    dragRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: now,
      velocity: 0,
      delta: 0,
      moved: false,
      startedOnHeader: Boolean((event.target as HTMLElement).closest("[data-island-toast-header-wrap]")),
      pointerId: event.pointerId,
    };
    toastElRef.current?.setAttribute("data-dragging", "");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const now = performance.now();
    const dt = Math.max(0.001, (now - state.lastTime) / 1000);
    state.velocity = (event.clientY - state.lastY) / dt;
    state.lastY = event.clientY;
    state.lastTime = now;

    const raw = event.clientY - state.startY;
    if (Math.abs(raw) > 4) state.moved = true;
    const clamped = raw * towardEdge > 0 ? clamp(raw, -SWIPE_MAX_PX, SWIPE_MAX_PX) : clamp(raw * 0.22, -SWIPE_MAX_PX * 0.35, SWIPE_MAX_PX * 0.35);
    state.delta = clamped;
    motionCtrl.setImmediate("dragY", clamped);
    if (dragFrameRef.current === null && typeof requestAnimationFrame === "function") {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        applyFrame();
      });
    } else if (typeof requestAnimationFrame !== "function") {
      applyFrame();
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (dragFrameRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      applyFrame();
    }
    dragRef.current = null;
    toastElRef.current?.removeAttribute("data-dragging");
    if (event.type === "pointerup" && state.moved && state.startedOnHeader) {
      ignoreNextClickRef.current = true;
      if (ignoreNextClickTimerRef.current !== null) clearTimeout(ignoreNextClickTimerRef.current);
      ignoreNextClickTimerRef.current = setTimeout(() => {
        ignoreNextClickRef.current = false;
        ignoreNextClickTimerRef.current = null;
      }, 0);
    }

    const velocityToward = state.velocity * towardEdge;
    const distToward = state.delta * towardEdge;
    if (distToward >= SWIPE_DISMISS_PX || velocityToward >= SWIPE_VELOCITY_PX_S) {
      store.haptic("light");
      store.dismiss(shown.id, "swipe");
    } else {
      motionCtrl.animateTo("dragY", 0, "dragReturn");
    }
  };

  const onHeaderClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      if (ignoreNextClickTimerRef.current !== null) {
        clearTimeout(ignoreNextClickTimerRef.current);
        ignoreNextClickTimerRef.current = null;
      }
      return;
    }
    if (leaving || !hasBody || shown.type === "loading" || pureCustom) return;
    const next = !expandedRef.current;
    manualExpandedRef.current = next;
    setExpandedState(next);
    if (next) pause();
    else resume();
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      resume();
    }
  };

  const closeButton = dismissible && closeLabel ? (
    <button
      type="button"
      data-island-toast-close=""
      className={["island-toast-close", styles?.close].filter(Boolean).join(" ")}
      aria-label={closeLabel}
      onClick={(e) => {
        e.stopPropagation();
        store.dismiss(shown.id, "user");
      }}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  ) : null;

  const actionButton = shown.action ? (
    <ToastActionButton
      action={shown.action}
      type={shown.type}
      className={styles?.action}
      onDismiss={() => store.dismiss(shown.id, "user")}
    />
  ) : null;

  const customFillStyle = shown.fill && surface === "solid" ? { "--island-bg": shown.fill } : null;

  const renderHeaderRow = (layer: HeaderLayer, role: "current" | "prev") => {
    const resolvedIcon =
      layer.icon !== undefined
        ? layer.icon
        : layer.type !== "custom"
          ? icons?.[layer.type] ?? <ToastIcon type={layer.type} />
          : null;
    const titleClassName = ["island-toast-title", styles?.title].filter(Boolean).join(" ");
    return (
      <div
        key={`${role}:${layer.key}`}
        data-island-toast-header-layer={role}
        aria-hidden={role === "prev" || undefined}
      >
        <div data-island-toast-header="" className={styles?.header}>
          {resolvedIcon !== null && (
            <span data-island-toast-icon="" data-type={layer.type} className={styles?.icon} aria-hidden="true">
              {resolvedIcon}
            </span>
          )}
          {role === "current" && hasBody && shown.type !== "loading" ? (
            <button
              type="button"
              data-island-toast-title=""
              className={titleClassName}
              aria-label={`${expanded ? "Hide" : "Show"} notification details: ${layer.title}`}
              aria-expanded={expanded}
              aria-controls={toastBodyId}
              disabled={leaving}
              onClick={(event) => {
                event.stopPropagation();
                onHeaderClick();
              }}
            >
              {layer.title}
            </button>
          ) : (
            <span data-island-toast-title="" className={titleClassName}>{layer.title}</span>
          )}
          {role === "current" && closeButton}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={toasterRef}
      data-island-toaster=""
      data-position={position}
      data-mode={mode}
      data-surface={surface}
      data-motion={motion.name}
      data-dir={dir}
      dir={dir}
      data-island-theme={explicitTheme ? theme : undefined}
      style={
        {
          "--island-inset": inset,
          "--island-inset-x": insetX,
          "--island-roundness": `${roundness}px`,
          ...(motion.css?.vars as CSSProperties | undefined),
          ...customFillStyle,
        } as CSSProperties
      }
    >
      <span ref={geometryProbeRef} data-island-toast-probe="" aria-hidden="true" />
      <div
        ref={toastElRef}
        key={shown.id}
        data-island-toast=""
        data-type={shown.type}
        data-surface={surface}
        data-state={leaving ? "closed" : "open"}
        data-expanded={expanded || pureCustom ? "" : undefined}
        className={styles?.root}
        onPointerEnter={() => {
          hoveredRef.current = true;
          pause();
          if (hasBody && shown.type !== "loading" && !pureCustom && !leaving) {
            setExpandedState(true);
          }
        }}
        onPointerLeave={() => {
          if (dragRef.current) return;
          hoveredRef.current = false;
          resume();
          if (!manualExpandedRef.current && !pureCustom && !leaving) {
            setExpandedState(false);
          }
        }}
        onFocus={pause}
        onBlur={onBlur}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          if (event.key === "Escape" && dismissible) store.dismiss(shown.id, "user");
        }}
      >
        {/* Background surface: either analytic SVG gooey path or real-time Liquid Glass */}
        {surface === "liquid-glass" ? (
          <IslandGlassBackdrop
            ref={glassRef}
            variant="gooey"
            glass={glass}
            isDark={isDark}
            dockedEdge={dockedEdge}
            initialPath={mountGeom.path}
            width={mountGeom.w}
            height={mountGeom.h}
          />
        ) : (
          <svg
            ref={solidSvgRef}
            data-island-toast-surface=""
            viewBox={`0 0 ${mountGeom.w} ${mountGeom.h}`}
            aria-hidden="true"
          >
            <path ref={solidPathRef} data-island-toast-path="" d={mountGeom.path} />
          </svg>
        )}

        {/* Body / custom content clipped cleanly to the live gooey silhouette */}
        <div ref={bodyClipRef} data-island-toast-clip="" style={{ clipPath: mountGeom.path ? `path("${mountGeom.path}")` : undefined }}>
          {pureCustom ? (
            <div ref={customMeasureRef} data-island-toast-custom="" data-open="">
              {shown.content as ReactNode}
              {actionButton}
              {closeButton}
            </div>
          ) : (
            hasBody && (
              <div
                data-island-toast-body=""
                data-edge={expandDownward ? "top" : "bottom"}
                data-open={expanded ? "" : undefined}
                className={styles?.body}
                aria-hidden={!expanded || undefined}
                inert={!expanded || leaving}
                id={toastBodyId}
              >
                <div ref={bodyInnerRef} data-island-toast-body-inner="">
                  {bodyNode !== undefined && bodyNode !== null && bodyNode !== "" && (
                    <div data-island-toast-description="" className={styles?.description}>{bodyNode}</div>
                  )}
                  {actionButton}
                </div>
              </div>
            )
          )}
        </div>

        {/* Header pill (skipped for pure custom cards without title/icon) */}
        {!pureCustom && (
          <div
            ref={headerWrapRef}
            data-island-toast-header-wrap=""
            data-clickable={hasBody && shown.type !== "loading" ? "" : undefined}
            onClick={onHeaderClick}
            style={{ left: `${mountGeom.pillX}px`, width: `${mountGeom.pillW}px` }}
          >
            <div ref={headerInnerRef} data-island-toast-header-stack="">
              {prevHeader && renderHeaderRow(prevHeader, "prev")}
              {renderHeaderRow(
                { key: headerKeyOf(shown), type: shown.type, title: shown.title, icon: shown.icon as ReactNode },
                "current",
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
DefaultIslandToastEngine.announces = "none";

function ToastActionButton({
  action,
  type,
  className,
  onDismiss,
}: {
  action: IslandToastAction;
  type: IslandToastType;
  className?: string;
  onDismiss: () => void;
}) {
  return (
    <button
      type="button"
      data-island-toast-action=""
      data-type={type}
      className={["island-toast-action", className].filter(Boolean).join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        action.onClick();
        if (action.dismiss !== false) onDismiss();
      }}
    >
      {action.label}
    </button>
  );
}

function ToastIcon({ type }: { type: IslandToastType }) {
  const common = {
    viewBox: "0 0 16 16",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  switch (type) {
    case "success":
      return <svg {...common}><path d="M3.5 8.5l3 3 6-7" /></svg>;
    case "error":
      return <svg {...common}><path d="M5 5l6 6M11 5l-6 6" /></svg>;
    case "warning":
      return <svg {...common}><path d="M8 4v5M8 11.5v.5" /></svg>;
    case "loading":
      return <svg {...common} data-island-spin=""><path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" /></svg>;
    case "action":
      return <svg {...common}><path d="M4.5 11.5l7-7M6 4.5h5.5V10" /></svg>;
    case "info":
      return <svg {...common}><path d="M8 7v5M8 4.5v.5" /></svg>;
    default:
      return null;
  }
}
