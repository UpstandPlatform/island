/**
 * Framework-free types for the island store. Content fields (`description`,
 * `icon`, `content`) are `unknown` here so the core never depends on React;
 * the React layer narrows them to `ReactNode`.
 */

export type IslandToastType = "success" | "error" | "warning" | "info" | "loading" | "action" | "custom";

/** Feedback hint for the host (e.g. Telegram `HapticFeedback`). */
export type IslandHaptic = "success" | "error" | "warning" | "light" | "selection";

export type IslandDismissReason = "timeout" | "user" | "swipe" | "replaced" | "overflow" | "api";

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

export interface IslandState {
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

export interface IslandStoreOptions {
  /**
   * `"replace"` (default): a new toast morphs the current one, like a single
   * dynamic island. `"queue"`: toasts wait their turn.
   */
  strategy?: "replace" | "queue";
  /** Max toasts waiting in the queue; the oldest waiting one is dropped. Default 3. */
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
  change: (state: IslandState) => void;
}
