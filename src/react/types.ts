import type { ComponentType, ReactNode } from "react";

import type { IslandMotionAdapter } from "../core/motion";
import type { IslandStore } from "../core/store";
import type {
  IslandAutopilot,
  IslandGlassOptions,
  IslandMode,
  IslandPosition,
  IslandSurface,
  IslandTheme,
  IslandToast,
  IslandToastOptions,
  IslandToastStyles,
  IslandToastType,
} from "../core/types";

export type { IslandPosition };

/** Custom icon overrides keyed by semantic toast type. */
export type IslandToastIcons = Partial<Record<Exclude<IslandToastType, "custom">, ReactNode>>;

/** Toast options with React content. */
export interface IslandReactToastOptions extends IslandToastOptions {
  description?: ReactNode;
  icon?: ReactNode;
  content?: ReactNode;
}

export interface IslandToastEngineProps {
  /** The toast that owns the island right now, or `null`. */
  toast: IslandToast | null;
  store: IslandStore;
  position: IslandPosition;
  mode: IslandMode;
  surface: IslandSurface;
  glass?: IslandGlassOptions;
  motion: IslandMotionAdapter;
  dir: "ltr" | "rtl";
  theme: IslandTheme;
  roundness: number;
  /** CSS length from the vertical viewport edge to the island's edge (safe area + gap). */
  inset: string;
  /** CSS length from the horizontal viewport edge for `*-left` / `*-right` positions. */
  insetX: string;
  autopilot: IslandAutopilot;
  swipeToDismiss: boolean;
  /** Accessible label for the close button; no button when omitted. */
  closeLabel?: string;
  icons?: IslandToastIcons;
  styles?: IslandToastStyles;
}

/**
 * A toast renderer. The store owns the lifecycle (ids, timers, queue); an
 * engine only draws `toast` and reports user dismissals back to `store`.
 */
export type IslandToastEngine = ComponentType<IslandToastEngineProps> & {
  /** Which announcements the engine already makes itself, so the toaster skips them. */
  announces?: "none" | "polite" | "all";
};
