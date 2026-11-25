/**
 * @upstand/island/sileo — draws island toasts with sileo
 * (https://github.com/hiaaryan/sileo). Requires the optional `sileo` peer.
 *
 * The island store stays the source of truth: every toast goes to one sileo
 * slot, so a new toast morphs the current one instead of stacking, exactly
 * like the island itself.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Toaster, sileo, type SileoOptions, type SileoState, type SileoStyles } from "sileo";

import { getPositionEdges, type IslandToastType } from "./core/types";
import type { IslandToastEngine, IslandToastEngineProps } from "./react/types";

export interface SileoEngineOptions {
  /** Sileo theme override. When omitted, follows the Island theme. */
  theme?: "light" | "dark" | "system";
  /** Toast fill colour (an SVG fill, so a literal colour, not a CSS variable). */
  fill?: string;
  styles?: SileoStyles;
  roundness?: number;
}

/** Sileo pads its viewport by 0.75rem; the island inset is measured to the toast itself. */
const SILEO_VIEWPORT_PADDING = "0.75rem";
const SLOT = "island";

const STATE: Record<IslandToastType, SileoState> = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
  loading: "loading",
  action: "action",
  custom: "info",
};

/** Build a sileo engine with your own sileo options. */
export function createSileoEngine({ theme: defaultTheme, fill, styles, roundness: defaultRoundness }: SileoEngineOptions = {}): IslandToastEngine {
  const SileoEngine: IslandToastEngine = function SileoEngine({
    toast,
    store,
    position,
    inset,
    insetX,
    dir,
    theme: islandTheme,
    roundness: islandRoundness,
    autopilot,
  }: IslandToastEngineProps) {
    const wrapper = useRef<HTMLDivElement>(null);
    const shown = useRef<string | null>(null);
    const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resolvedTheme = defaultTheme ?? islandTheme;
    const resolvedRoundness = defaultRoundness ?? toast?.roundness ?? islandRoundness;
    const resolvedFill = toast?.fill ?? fill;

    useEffect(() => {
      if (!toast) {
        if (shown.current) sileo.dismiss(SLOT);
        shown.current = null;
        return;
      }
      shown.current = toast.id;
      const action = toast.action;
      sileo.show({
        id: SLOT,
        title: toast.title,
        description: (toast.content ?? toast.description) as ReactNode,
        type: STATE[toast.type],
        // Sileo needs the duration to run its expand/collapse autopilot; the
        // store dismisses at the same moment, so the two stay in step.
        duration: toast.duration,
        ...(toast.icon !== undefined && { icon: toast.icon as ReactNode }),
        position,
        ...(resolvedFill !== undefined && { fill: resolvedFill }),
        ...(resolvedRoundness !== undefined && { roundness: resolvedRoundness }),
        ...(autopilot !== undefined && { autopilot }),
        ...(action && {
          button: {
            title: action.label,
            onClick: () => {
              action.onClick();
              if (action.dismiss !== false) store.dismiss(toast.id, "user");
            },
          },
        }),
      } as SileoOptions & { id: string });
    }, [toast, store, position, resolvedFill, resolvedRoundness, autopilot]);

    useEffect(() => () => {
      if (swipeTimer.current !== null) clearTimeout(swipeTimer.current);
      if (shown.current) sileo.dismiss(SLOT);
    }, []);

    // Sileo dismisses on swipe without telling anyone; check right after the
    // gesture ends and mirror it into the store.
    const onPointerUp = () => {
      const id = shown.current;
      if (!id) return;
      if (swipeTimer.current !== null) clearTimeout(swipeTimer.current);
      swipeTimer.current = setTimeout(() => {
        swipeTimer.current = null;
        const live = wrapper.current?.querySelector('[data-sileo-toast]:not([data-exiting="true"])');
        if (!live && store.getSnapshot().toast?.id === id) {
          store.haptic("light");
          store.dismiss(id, "swipe");
        }
      }, 120);
    };

    const edges = getPositionEdges(position);
    const offset: Record<string, string> = {
      [edges.vertical]: `calc(${inset} - ${SILEO_VIEWPORT_PADDING})`,
      ...(edges.horizontal !== "center" && {
        [edges.horizontal]: `calc(${insetX} - ${SILEO_VIEWPORT_PADDING})`,
      }),
    };

    return (
      <div
        ref={wrapper}
        data-island-sileo=""
        dir={dir}
        style={{ display: "contents", "--sileo-height": "var(--island-height)" } as CSSProperties}
        onMouseEnter={store.pause}
        onMouseLeave={store.resume}
        onPointerUp={onPointerUp}
      >
        <Toaster
          position={position}
          offset={offset}
          theme={resolvedTheme}
          options={{
            ...(fill !== undefined && { fill }),
            ...(styles && { styles }),
            ...(resolvedRoundness !== undefined && { roundness: resolvedRoundness }),
            ...(autopilot !== undefined && { autopilot }),
          }}
        />
      </div>
    );
  };
  // Sileo's viewport is an aria-live="polite" region; the toaster adds assertive ones.
  SileoEngine.announces = "polite";
  return SileoEngine;
}

/** Sileo engine with default options. */
export const sileoEngine: IslandToastEngine = /* @__PURE__ */ createSileoEngine();
