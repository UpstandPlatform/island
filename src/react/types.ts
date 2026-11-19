import type { ComponentType, ReactNode } from "react";

import type { IslandStore } from "../core/store";
import type { IslandToast, IslandToastOptions } from "../core/types";

/** Toast options with React content. */
export interface IslandReactToastOptions extends IslandToastOptions {
  description?: ReactNode;
  icon?: ReactNode;
  content?: ReactNode;
}

export type IslandPosition = "top-center" | "bottom-center";

export interface IslandToastEngineProps {
  /** The toast that owns the island right now, or `null`. */
  toast: IslandToast | null;
  store: IslandStore;
  position: IslandPosition;
  /** CSS length from the viewport edge to the island's edge (safe area + gap). */
  inset: string;
  swipeToDismiss: boolean;
  /** Accessible label for the close button; no button when omitted. */
  closeLabel?: string;
}

/**
 * A toast renderer. The store owns the lifecycle (ids, timers, queue); an
 * engine only draws `toast` and reports user dismissals back to `store`.
 */
export type IslandToastEngine = ComponentType<IslandToastEngineProps> & {
  /** Which announcements the engine already makes itself, so the toaster skips them. */
  announces?: "none" | "polite" | "all";
};
