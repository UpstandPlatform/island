import type {
  IslandDismissReason,
  IslandEvents,
  IslandHaptic,
  IslandPromiseMessages,
  IslandState,
  IslandStoreOptions,
  IslandTimers,
  IslandToast,
  IslandToastMessage,
  IslandToastOptions,
  IslandToastType,
} from "./types";

export const DEFAULT_DURATIONS: Readonly<Record<IslandToastType, number | null>> = {
  success: 6000,
  error: 6000,
  warning: 6000,
  info: 6000,
  action: 6000,
  custom: 6000,
  loading: null,
};

/** Snapshot used on the server and before anything happens. Never mutated. */
export const EMPTY_ISLAND_STATE: IslandState = Object.freeze({
  busy: false,
  busyCount: 0,
  busyLabel: null,
  toast: null,
  queue: Object.freeze([]) as readonly IslandToast[],
  slots: Object.freeze({}),
});

const HAPTIC_FOR: Partial<Record<IslandToastType, IslandHaptic>> = {
  success: "success",
  error: "error",
  warning: "warning",
};

export type IslandToastInput = IslandToastOptions & { type?: IslandToastType };

export interface IslandStore {
  getSnapshot: () => IslandState;
  /** Always the empty state: busy and toasts are client-only. */
  getServerSnapshot: () => IslandState;
  subscribe: (listener: () => void) => () => void;
  on: <E extends keyof IslandEvents>(event: E, handler: IslandEvents[E]) => () => void;
  configure: (options: IslandStoreOptions) => void;

  /** Mark the island busy; returns an idempotent `done` function. */
  busy: (label?: string | null) => () => void;

  show: (input: IslandToastInput) => string;
  update: (id: string, patch: IslandToastInput) => boolean;
  dismiss: (id?: string, reason?: IslandDismissReason) => void;
  promise: <T>(promise: Promise<T> | (() => Promise<T>), messages: IslandPromiseMessages<T>) => Promise<T>;
  /** Pause / resume auto-dismiss of the visible toast (hover, focus, touch). */
  pause: () => void;
  resume: () => void;
  /** Forward a feedback hint to `onHaptic`. */
  haptic: (kind: IslandHaptic) => void;

  /** Register a slot value; the newest registration per key wins. Returns `release`. */
  setSlot: (key: string, value: unknown) => { update: (value: unknown) => void; release: () => void };
}

const defaultTimers: IslandTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${(++uid).toString(36)}`;

function toOptions(message: IslandToastMessage): IslandToastOptions {
  return typeof message === "string" ? { title: message } : message;
}

/** Create an isolated island store. Safe to call at import time: it touches no globals. */
export function createIslandStore(initial: IslandStoreOptions = {}): IslandStore {
  let options: IslandStoreOptions = { ...initial };
  let state: IslandState = EMPTY_ISLAND_STATE;
  const listeners = new Set<() => void>();
  const handlers: { [E in keyof IslandEvents]?: Set<IslandEvents[E]> } = {};

  const busyEntries = new Map<number, string | null>();
  let busyToken = 0;

  const slotEntries = new Map<string, Map<number, unknown>>();
  let slotToken = 0;

  let visible: IslandToast | null = null;
  let queue: IslandToast[] = [];
  /** Ids the user or caller dismissed: late promise results stay quiet for them. */
  const dismissed = new Set<string>();

  let timer: unknown = null;
  let timerStartedAt = 0;
  let remaining: number | null = null;
  let paused = false;

  const now = () => (options.now ?? Date.now)();
  const timers = () => options.timers ?? defaultTimers;

  function fire<E extends keyof IslandEvents>(event: E, ...args: Parameters<IslandEvents[E]>) {
    const set = handlers[event];
    if (!set) return;
    for (const handler of set) (handler as (...a: Parameters<IslandEvents[E]>) => void)(...args);
  }

  function computeSlots(): Record<string, unknown> {
    const slots: Record<string, unknown> = {};
    for (const [key, entries] of slotEntries) {
      let last: unknown;
      for (const value of entries.values()) last = value;
      if (entries.size > 0) slots[key] = last;
    }
    return slots;
  }

  function emit(parts: { slots?: boolean } = {}) {
    let label: string | null = null;
    for (const value of busyEntries.values()) if (value) label = value;
    state = {
      busy: busyEntries.size > 0,
      busyCount: busyEntries.size,
      busyLabel: label,
      toast: visible,
      queue: queue.slice(),
      slots: parts.slots ? computeSlots() : state.slots,
    };
    for (const listener of listeners) listener();
    fire("change", state);
  }

  function haptic(kind: IslandHaptic) {
    try {
      options.onHaptic?.(kind);
    } catch {
      // Feedback is best effort; never break a toast over it.
    }
  }

  function clearTimer() {
    if (timer !== null) timers().clear(timer);
    timer = null;
  }

  function startTimer(ms: number | null) {
    clearTimer();
    remaining = ms;
    if (ms === null || ms <= 0 || !Number.isFinite(ms) || paused) return;
    timerStartedAt = now();
    const id = visible?.id;
    timer = timers().set(() => {
      timer = null;
      if (visible && visible.id === id) dismiss(id, "timeout");
    }, ms);
  }

  function durationFor(type: IslandToastType, explicit: number | null | undefined): number | null {
    if (explicit !== undefined) return explicit;
    const configured = options.durations?.[type];
    return configured !== undefined ? configured : DEFAULT_DURATIONS[type];
  }

  function present(toast: IslandToast) {
    visible = toast;
    startTimer(toast.duration);
    const kind = HAPTIC_FOR[toast.type];
    if (kind) haptic(kind);
    fire("show", toast);
  }

  function leave(toast: IslandToast, reason: IslandDismissReason) {
    if (reason === "user" || reason === "swipe" || reason === "api") {
      dismissed.add(toast.id);
      if (dismissed.size > 100) dismissed.delete(dismissed.values().next().value as string);
    }
    try {
      toast.onDismiss?.(toast, reason);
    } catch {
      // A broken callback must not wedge the queue.
    }
    fire("dismiss", toast, reason);
  }

  function show(input: IslandToastInput): string {
    const { type = "info", duration, ...rest } = input;
    const id = rest.id ?? nextId("island-toast");
    if (findToast(id)) {
      update(id, input);
      return id;
    }
    dismissed.delete(id);
    const toast: IslandToast = {
      ...rest,
      id,
      type,
      duration: durationFor(type, duration),
      createdAt: now(),
      version: 0,
    };
    if (!visible) {
      present(toast);
    } else if ((options.strategy ?? "replace") === "replace") {
      const previous = visible;
      present(toast);
      leave(previous, "replaced");
    } else {
      queue.push(toast);
      const max = Math.max(0, options.maxQueue ?? 3);
      while (queue.length > max) {
        const dropped = queue.shift();
        if (dropped) leave(dropped, "overflow");
      }
    }
    emit();
    return id;
  }

  function findToast(id: string) {
    if (visible?.id === id) return visible;
    return queue.find((toast) => toast.id === id);
  }

  function update(id: string, patch: IslandToastInput): boolean {
    const current = findToast(id);
    if (!current) return false;
    const { duration, id: _ignored, ...rest } = patch;
    const type = rest.type ?? current.type;
    const typeChanged = type !== current.type;
    const next: IslandToast = {
      ...current,
      ...rest,
      id,
      type,
      // A type change (loading → success) picks up that type's default duration.
      duration: duration !== undefined ? duration : typeChanged ? durationFor(type, undefined) : current.duration,
      version: current.version + 1,
    };
    if (visible?.id === id) {
      visible = next;
      startTimer(next.duration);
      const kind = typeChanged ? HAPTIC_FOR[type] : undefined;
      if (kind) haptic(kind);
    } else {
      queue = queue.map((toast) => (toast.id === id ? next : toast));
    }
    fire("update", next);
    emit();
    return true;
  }

  function dismiss(id?: string, reason: IslandDismissReason = "api") {
    if (id === undefined) {
      const all = [...(visible ? [visible] : []), ...queue];
      clearTimer();
      remaining = null;
      paused = false;
      visible = null;
      queue = [];
      for (const toast of all) leave(toast, reason);
      if (all.length) emit();
      return;
    }
    if (visible?.id === id) {
      const previous = visible;
      clearTimer();
      remaining = null;
      visible = null;
      const next = queue.shift();
      if (!next || reason === "user" || reason === "swipe" || reason === "api") paused = false;
      if (next) present(next);
      leave(previous, reason);
      emit();
      return;
    }
    const waiting = queue.find((toast) => toast.id === id);
    if (!waiting) return;
    queue = queue.filter((toast) => toast.id !== id);
    leave(waiting, reason);
    emit();
  }

  function promise<T>(input: Promise<T> | (() => Promise<T>), messages: IslandPromiseMessages<T>): Promise<T> {
    const id = show({ ...toOptions(messages.loading), id: messages.id ?? nextId("island-promise"), type: "loading", duration: null });
    let p: Promise<T>;
    try {
      p = typeof input === "function" ? input() : input;
    } catch (error) {
      p = Promise.reject(error);
    }
    const settle = (type: "success" | "error", message: IslandToastMessage) => {
      if (dismissed.has(id)) return;
      const opts = { ...toOptions(message), type };
      // Replaced while loading? Show the result on its own instead of losing it.
      if (!update(id, { description: undefined, action: undefined, icon: undefined, content: undefined, duration: undefined, ...opts })) {
        show({ ...opts, id });
      }
    };
    p.then(
      (value) => settle("success", typeof messages.success === "function" ? messages.success(value) : messages.success),
      (error: unknown) => settle("error", typeof messages.error === "function" ? messages.error(error) : messages.error),
    );
    return p;
  }

  function pause() {
    if (paused) return;
    paused = true;
    if (timer !== null && remaining !== null) {
      remaining = Math.max(0, remaining - (now() - timerStartedAt));
      clearTimer();
    }
  }

  function resume() {
    if (!paused) return;
    paused = false;
    if (visible) startTimer(remaining);
  }

  function busy(label: string | null = null) {
    const token = ++busyToken;
    busyEntries.set(token, label);
    emit();
    fire("busy", { busy: true, label: state.busyLabel, count: busyEntries.size });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      busyEntries.delete(token);
      emit();
      fire("busy", { busy: busyEntries.size > 0, label: state.busyLabel, count: busyEntries.size });
    };
  }

  function setSlot(key: string, value: unknown) {
    const token = ++slotToken;
    let entries = slotEntries.get(key);
    if (!entries) slotEntries.set(key, (entries = new Map()));
    entries.set(token, value);
    emit({ slots: true });
    let released = false;
    return {
      update(next: unknown) {
        if (released || !entries) return;
        if (Object.is(entries.get(token), next)) return;
        entries.set(token, next);
        emit({ slots: true });
      },
      release() {
        if (released) return;
        released = true;
        entries?.delete(token);
        if (entries?.size === 0) slotEntries.delete(key);
        emit({ slots: true });
      },
    };
  }

  return {
    getSnapshot: () => state,
    getServerSnapshot: () => EMPTY_ISLAND_STATE,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    on(event, handler) {
      const map = handlers as Record<string, Set<typeof handler> | undefined>;
      const set = (map[event] ??= new Set());
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    configure(next) {
      options = { ...options, ...next };
    },
    busy,
    show,
    update,
    dismiss,
    promise,
    pause,
    resume,
    haptic,
    setSlot,
  };
}
