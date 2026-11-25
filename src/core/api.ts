import { createIslandStore, type IslandStore } from "./store";
import type {
  IslandDirection,
  IslandMode,
  IslandPosition,
  IslandPromiseMessages,
  IslandSurface,
  IslandTheme,
  IslandToastAction,
  IslandToastMessage,
  IslandToastOptions,
  IslandToastType,
} from "./types";

type ToastFn<O> = (message: string | O, options?: O) => string;

export interface IslandToastApi<O extends IslandToastOptions = IslandToastOptions> {
  success: ToastFn<O>;
  error: ToastFn<O>;
  warning: ToastFn<O>;
  info: ToastFn<O>;
  /** Sticky spinner toast; resolve it with `update` or `dismiss`. */
  loading: ToastFn<O>;
  /** Toast with a button. */
  action: (message: string | (O & { action: IslandToastAction }), options?: O & { action: IslandToastAction }) => string;
  /** Free-form body rendered by the toaster as-is. */
  custom: (content: O["content"], options?: O) => string;
  /** Dismiss one toast, or all when called without an id. */
  dismiss: (id?: string) => void;
  /** Patch a toast that is shown or waiting. Returns false if it is gone. */
  update: (id: string, patch: O & { type?: IslandToastType }) => boolean;
  promise: <T>(promise: Promise<T> | (() => Promise<T>), messages: IslandPromiseMessages<T, O>) => Promise<T>;
}

export interface IslandApi<O extends IslandToastOptions = IslandToastOptions> {
  toast: IslandToastApi<O>;
  /** Mark the island busy (e.g. paging); call the returned function when done. */
  busy: (label?: string | null) => () => void;
  /** Update the island anchor position across viewport and toaster. */
  setPosition: (position: IslandPosition) => void;
  /** Switch between `"floating"` capsule and `"dock"` edge-attached mode. */
  setMode: (mode: IslandMode) => void;
  /** Switch between `"solid"` and `"liquid-glass"` surfaces. */
  setSurface: (surface: IslandSurface) => void;
  /** Set reading direction (`"ltr"`, `"rtl"`, or `"auto"`). */
  setDir: (dir: IslandDirection) => void;
  /** Set palette theme (`"dark"`, `"light"`, or `"system"`). */
  setTheme: (theme: IslandTheme) => void;
  readonly store: IslandStore;
}

function normalize<O extends IslandToastOptions>(message: string | O, options?: O): IslandToastOptions {
  return typeof message === "string" ? { ...options, title: message } : { ...message, ...options };
}

/** Bind the imperative API to a store. `getStore` is read lazily on every call. */
export function createIslandApi<O extends IslandToastOptions = IslandToastOptions>(getStore: () => IslandStore): IslandApi<O> {
  const of = (type: IslandToastType): ToastFn<O> => (message, options) => getStore().show({ ...normalize(message, options), type });
  return {
    toast: {
      success: of("success"),
      error: of("error"),
      warning: of("warning"),
      info: of("info"),
      loading: of("loading"),
      action: (message, options) => getStore().show({ ...normalize(message, options), type: "action" }),
      custom: (content, options) => getStore().show({ ...options, content, type: "custom" }),
      dismiss: (id) => getStore().dismiss(id, "api"),
      update: (id, patch) => getStore().update(id, patch),
      promise: (promise, messages) => getStore().promise(promise, messages),
    },
    busy: (label) => getStore().busy(label),
    setPosition: (position) => getStore().setPosition(position),
    setMode: (mode) => getStore().setMode(mode),
    setSurface: (surface) => getStore().setSurface(surface),
    setDir: (dir) => getStore().setDir(dir),
    setTheme: (theme) => getStore().setTheme(theme),
    get store() {
      return getStore();
    },
  };
}

let defaultStore: IslandStore | undefined;

/** The shared store used by `island` and by `<IslandProvider>` without a `store` prop. */
export function getDefaultIslandStore(): IslandStore {
  return (defaultStore ??= createIslandStore());
}

export type { IslandToastMessage };
