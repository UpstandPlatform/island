/**
 * Framework-free types and pure layout helpers for `@upstand/island`.
 * Content fields (`description`, `icon`, `content`) remain `unknown` here
 * so the core never depends on React; the React layer narrows them to `ReactNode`.
 */
import type { IslandMotionInput } from "./motion";

export type IslandToastType = "success" | "error" | "warning" | "info" | "loading" | "action" | "custom";

/** Feedback hint for the host (e.g. Telegram `HapticFeedback`). */
export type IslandHaptic = "success" | "error" | "warning" | "light" | "selection";

export type IslandDismissReason = "timeout" | "user" | "swipe" | "replaced" | "overflow" | "api";

/** Supported 6-point viewport anchor positions. */
export const ISLAND_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type IslandPosition = (typeof ISLAND_POSITIONS)[number];

export type IslandVerticalEdge = "top" | "bottom";
export type IslandHorizontalAlign = "left" | "center" | "right";

/** Presentation mode: floating capsule or edge-docked notch/dock bar. */
export type IslandMode = "floating" | "dock";

/** Surface rendering style: crisp solid silhouette or real-time refractive Liquid Glass. */
export type IslandSurface = "solid" | "liquid-glass";

/** Layout reading direction. `"auto"` follows the nearest `[dir]` or document direction. */
export type IslandDirection = "ltr" | "rtl" | "auto";

/** Surface palette mode. */
export type IslandTheme = "dark" | "light" | "system";

/** Autopilot expand/collapse delays in ms, or boolean to enable/disable. */
export type IslandAutopilot = boolean | { expand?: number; collapse?: number };

/** Visual tuning for `surface="liquid-glass"`. */
export interface IslandGlassOptions {
  /** Backdrop blur in px. Default `10`. */
  blur?: number;
  /** Backdrop saturation multiplier. Default `1.65`. */
  saturation?: number;
  /** Optical rim refraction strength (`0` disables displacement). Default `1.15`. */
  refraction?: number;
  /** Chromatic dispersion strength along refractive rim (`0` disables). Default `0.75`. */
  dispersion?: number;
  /** Specular rim highlight intensity (`0..2`). Default `1`. */
  specular?: number;
  /** Custom glass tint color overriding automatic light/dark tint. */
  tint?: string;
  /** Lightweight frosted glass without SVG refraction shaders. Default `false`. */
  lite?: boolean;
}

/** Class name overrides for sub-elements of a built-in toast. */
export interface IslandToastStyles {
  root?: string;
  header?: string;
  icon?: string;
  title?: string;
  body?: string;
  description?: string;
  action?: string;
  close?: string;
}

/** Active layout configuration tracked by the island store. */
export interface IslandLayoutState {
  position: IslandPosition;
  mode: IslandMode;
  surface: IslandSurface;
  dir: IslandDirection;
  theme: IslandTheme;
}

export interface IslandPositionEdges {
  vertical: IslandVerticalEdge;
  horizontal: IslandHorizontalAlign;
  expandsDownward: boolean;
}

/** Decompose an `IslandPosition` into vertical edge, horizontal alignment, and expansion direction. */
export function getPositionEdges(position: IslandPosition): IslandPositionEdges {
  const vertical: IslandVerticalEdge = position.startsWith("bottom-") ? "bottom" : "top";
  const horizontal: IslandHorizontalAlign = position.endsWith("-left")
    ? "left"
    : position.endsWith("-right")
      ? "right"
      : "center";
  return {
    vertical,
    horizontal,
    expandsDownward: vertical === "top",
  };
}

export interface IslandToastAction {
  label: string;
  onClick: () => void;
  /** Dismiss the toast after the action runs. Default `true`. */
  dismiss?: boolean;
}

export interface IslandToastOptions {
  /** Stable id: showing a toast with an id that is already up updates it in place. */
  id?: string;
  title?: string;
  description?: unknown;
  /** Milliseconds before auto-dismiss; `null` keeps it until dismissed. */
  duration?: number | null;
  action?: IslandToastAction;
  icon?: unknown;
  /** Custom body for `toast.custom`. */
  content?: unknown;
  /** Announce assertively (defaults to `true` for errors). */
  important?: boolean;
  /** Allow swipe / close dismissal. Default `true`. */
  dismissible?: boolean;
  /** Override toast anchor position for this toast. */
  position?: IslandPosition;
  /** Override surface style (`"solid"` | `"liquid-glass"`) for this toast. */
  surface?: IslandSurface;
  /** Override Liquid Glass tuning for this toast. */
  glass?: IslandGlassOptions;
  /** Corner roundness and gooey fillet radius in px. Default `16`. */
  roundness?: number;
  /** Autopilot expand/collapse timings for toasts with body content. */
  autopilot?: IslandAutopilot;
  /** Override motion preset or custom adapter for this toast. */
  motion?: IslandMotionInput;
  /** Optional class overrides for toast sub-elements. */
  styles?: IslandToastStyles;
  /** Custom solid background fill color for this toast. */
  fill?: string;
  /** Free-form data for custom renderers. */
  data?: Record<string, unknown>;
  /** Called once when the toast leaves, whatever the reason. */
  onDismiss?: (toast: IslandToast, reason: IslandDismissReason) => void;
}

export interface IslandToast extends Omit<IslandToastOptions, "id" | "duration"> {
  id: string;
  type: IslandToastType;
  duration: number | null;
  createdAt: number;
  /** Increments on every update; renderers key transitions on it. */
  version: number;
}

export interface IslandState extends IslandLayoutState {
  /** True while at least one busy registration is open. */
  busy: boolean;
  /** Number of open busy registrations. */
  busyCount: number;
  /** Label of the newest busy registration that has one. */
  busyLabel: string | null;
  /** The toast currently shown in the island, if any. */
  toast: IslandToast | null;
  /** Toasts waiting their turn (only used with the `"queue"` strategy). */
  queue: readonly IslandToast[];
  /** Newest value for each slot key. */
  slots: Readonly<Record<string, unknown>>;
}

export type IslandToastMessage<O extends IslandToastOptions = IslandToastOptions> = string | O;

export interface IslandPromiseMessages<T, O extends IslandToastOptions = IslandToastOptions> {
  loading: IslandToastMessage<O>;
  success: IslandToastMessage<O> | ((value: T) => IslandToastMessage<O>);
  error: IslandToastMessage<O> | ((error: unknown) => IslandToastMessage<O>);
  /** Use this id for the toast (lets callers dismiss or update it). */
  id?: string;
}

export interface IslandTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface IslandStoreOptions extends Partial<IslandLayoutState> {
  /**
   * `"replace"` (default): a new toast morphs the current one, like a single
   * dynamic island. `"queue"`: toasts wait their turn.
   */
  strategy?: "replace" | "queue";
  /** Max toasts waiting in the queue; the oldest waiting one is dropped first. Default 3. */
  maxQueue?: number;
  /** Default durations per type in ms (`null` = sticky). */
  durations?: Partial<Record<IslandToastType, number | null>>;
  /** Called with a feedback hint when toasts appear or are swiped away. */
  onHaptic?: (haptic: IslandHaptic) => void;
  /** Injectable clock and timers (tests). */
  now?: () => number;
  timers?: IslandTimers;
}

export interface IslandEvents {
  show: (toast: IslandToast) => void;
  update: (toast: IslandToast) => void;
  dismiss: (toast: IslandToast, reason: IslandDismissReason) => void;
  busy: (state: { busy: boolean; label: string | null; count: number }) => void;
  layout: (layout: IslandLayoutState) => void;
  change: (state: IslandState) => void;
}
