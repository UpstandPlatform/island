import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import type { IslandMotionInput } from "../core/motion";
import {
  getPositionEdges,
  type IslandDirection,
  type IslandGlassOptions,
  type IslandMode,
  type IslandPosition,
  type IslandSurface,
  type IslandTheme,
} from "../core/types";
import {
  useIsland,
  useIslandConfig,
  useIslandDirection,
  useIslandLayoutField,
  useIslandMotion,
  useIslandStore,
  useIslandToastActive,
} from "./context";
import { IslandGlassBackdrop } from "./glass";
import { useAutoMorph, useIsomorphicLayoutEffect, useResolvedDarkTheme } from "./hooks";

export interface IslandProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "dir"> {
  /** Start slot: back button, avatar… */
  leading?: ReactNode;
  /** Title; while busy it crossfades to the busy label. Ignored when `children` is given. */
  title?: ReactNode;
  /** Small chip after the title. Ignored when `children` is given. */
  badge?: ReactNode;
  /** End slot: profile, page action… */
  trailing?: ReactNode;
  /** `"auto"` (default) sweeps a bar along the lower edge while busy. */
  progress?: boolean | "auto";
  /** Content revealed below (or above when bottom-positioned) when `open`. */
  expanded?: ReactNode;
  open?: boolean;
  /** Fade and stretch out while a toast owns the island. Default `true`. */
  hideOnToast?: boolean;
  /** Screen-reader text while busy without a label (the package ships no strings). */
  busyFallbackLabel?: string;
  /** Anchor position used for expansion direction and origin. Inherits from provider/store. */
  position?: IslandPosition;
  /** Presentation mode: `"floating"` capsule or edge-attached `"dock"`. */
  mode?: IslandMode;
  /** Surface material: `"solid"` or live refractive `"liquid-glass"`. */
  surface?: IslandSurface;
  /** Tuning options when `surface="liquid-glass"`. */
  glass?: IslandGlassOptions;
  /** Motion preset (`"bouncy"`, `"smooth"`, `"snappy"`, `"elastic"`, `"gentle"`, `"instant"`) or custom adapter. */
  motion?: IslandMotionInput;
  /** Reading direction (`"ltr"`, `"rtl"`, or `"auto"`). */
  dir?: IslandDirection;
  /** Surface palette (`"dark"`, `"light"`, or `"system"`). */
  theme?: IslandTheme;
  /** Corner roundness in px when expanded or customized. */
  roundness?: number;
  /** Smooth 120Hz physics width/height auto-morphing on content or `open` changes. Default `true`. */
  autoMorph?: boolean;
  /** Replaces the title + badge region, e.g. to wrap them in a link. Use `<IslandTitle>` inside. */
  children?: ReactNode;
}

/**
 * Headless dynamic island. Renders structure and `data-*` state only; import
 * `@upstand/island/island.css` for the default look (with solid + live Liquid
 * Glass + Dock mode + RTL + 120Hz spring physics), or style `[data-island…]` yourself.
 */
export const Island = forwardRef<HTMLDivElement, IslandProps>(function Island(
  {
    leading,
    title,
    badge,
    trailing,
    progress = "auto",
    expanded,
    open = false,
    hideOnToast = true,
    busyFallbackLabel,
    position: positionProp,
    mode: modeProp,
    surface: surfaceProp,
    glass: glassProp,
    motion: motionProp,
    dir: dirProp,
    theme: themeProp,
    roundness: roundnessProp,
    autoMorph = true,
    children,
    style,
    ...rest
  },
  forwarded,
) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLDivElement, []);

  const store = useIslandStore();
  const config = useIslandConfig();
  const toastActive = useIslandToastActive();
  const busy = useIsland((state) => state.busy);
  const busyLabel = useIsland((state) => state.busyLabel);

  const position = useIslandLayoutField("position", positionProp);
  const mode = useIslandLayoutField("mode", modeProp);
  const surface = useIslandLayoutField("surface", surfaceProp);
  const theme = useIslandLayoutField("theme", themeProp);
  const explicitTheme = themeProp !== undefined || config.theme !== undefined || store.hasLayoutOverride("theme");
  const resolvedDir = useIslandDirection(dirProp);
  const motionAdapter = useIslandMotion(motionProp);
  const isDark = useResolvedDarkTheme(explicitTheme ? theme : "system", ref);
  const glass = glassProp ?? config.glass;
  const roundness = roundnessProp ?? config.roundness;
  const edges = getPositionEdges(position);

  const hidden = hideOnToast && toastActive;
  const showBusy = busy && !hidden;
  const isOpen = open && expanded !== undefined;
  const showProgress = progress === "auto" ? true : progress;
  const morphEnabled = autoMorph && !motionAdapter.reduced;
  const hasLeading = leading !== undefined && leading !== null && typeof leading !== "boolean";
  const hasTrailing = trailing !== undefined && trailing !== null && typeof trailing !== "boolean";
  const hasBadge = badge !== undefined && badge !== null && typeof badge !== "boolean";

  useAutoMorph(ref, contentRef, motionAdapter, morphEnabled);

  // Measure live space from the anchored bar edge to the opposite viewport edge
  // so expanded panels never overflow above the top bar or below the bottom bar.
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    if (!isOpen || typeof window === "undefined") {
      el.style.removeProperty("--island-available-height");
      return;
    }
    const updateAvailable = () => {
      const rect = anchor.getBoundingClientRect();
      const available = edges.expandsDownward
        ? Math.max(120, Math.floor(window.innerHeight - rect.top - 16))
        : Math.max(120, Math.floor(rect.bottom - 16));
      el.style.setProperty("--island-available-height", `${available}px`);
    };
    updateAvailable();
    window.addEventListener("resize", updateAvailable);
    return () => window.removeEventListener("resize", updateAvailable);
  }, [isOpen, edges.expandsDownward]);

  // `inert` keeps focus out of the island while the toast stands in for it,
  // and out of collapsed expanded content so keyboard Tab cannot enter it.
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = hidden;
  }, [hidden]);

  useEffect(() => {
    const el = expandedRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !isOpen;
  }, [isOpen]);

  const mergedStyle: CSSProperties = {
    ...(motionAdapter.css?.vars as CSSProperties | undefined),
    ...(roundness !== undefined ? { "--island-radius-expanded": `${roundness}px`, "--island-roundness": `${roundness}px` } : null),
    ...style,
  };

  return (
    <div
      ref={anchorRef}
      data-island-anchor=""
      data-position={position}
      data-mode={mode}
      data-open={isOpen ? "" : undefined}
      data-hidden={hidden ? "" : undefined}
      data-dir={resolvedDir}
      dir={resolvedDir}
    >
      <div
        ref={ref}
        data-island=""
        data-position={position}
        data-mode={mode}
        data-surface={surface}
        data-motion={motionAdapter.name}
        data-auto-morph={morphEnabled ? "" : undefined}
        data-dir={resolvedDir}
        dir={resolvedDir}
        data-island-theme={explicitTheme ? theme : undefined}
        data-toast-active={toastActive ? "" : undefined}
        data-hidden={hidden ? "" : undefined}
        data-busy={showBusy ? "" : undefined}
        data-open={isOpen ? "" : undefined}
        aria-hidden={hidden || undefined}
        aria-busy={showBusy || undefined}
        style={mergedStyle}
        {...rest}
      >
        {surface === "liquid-glass" && (
          <IslandGlassBackdrop
            variant="capsule"
            glass={glass}
            isDark={isDark}
            dockedEdge={mode === "dock" ? edges.vertical : null}
          />
        )}
        <div ref={contentRef} data-island-content="">
          <div data-island-bar="">
            {hasLeading && <div data-island-leading="">{leading}</div>}
            {children ?? (
              <div data-island-body="">
                <IslandTitle>{title}</IslandTitle>
                {hasBadge && <span data-island-badge="">{badge}</span>}
              </div>
            )}
            {hasTrailing && <div data-island-trailing="">{trailing}</div>}
          </div>
          {expanded !== undefined && (
            <div ref={expandedRef} data-island-expanded="" data-open={isOpen ? "" : undefined} aria-hidden={!isOpen || undefined}>
              <div data-island-expanded-inner="">{expanded}</div>
            </div>
          )}
        </div>
        <span role="status" data-island-sr="">{showBusy ? busyLabel ?? busyFallbackLabel ?? "" : ""}</span>
        {showProgress && <IslandProgress active={showBusy} />}
      </div>
    </div>
  );
});

export interface IslandTitleProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

/** Title that crossfades to the newest busy label while the island is busy. */
export function IslandTitle({ children, ...rest }: IslandTitleProps) {
  const toastActive = useIslandToastActive();
  const busy = useIsland((state) => state.busy) && !toastActive;
  const label = useIsland((state) => state.busyLabel);
  const swapping = busy && Boolean(label);
  return (
    <span data-island-title="" {...rest}>
      <span data-island-title-text="" data-hidden={swapping ? "" : undefined}>{children}</span>
      {swapping && (
        <span key={label} aria-hidden="true" data-island-busy-label="">{label}</span>
      )}
    </span>
  );
}

/** Thin sweeping bar along the island's lower edge. */
export function IslandProgress({ active }: { active?: boolean }) {
  const busy = useIsland((state) => state.busy);
  const on = active ?? busy;
  return (
    <span aria-hidden="true" data-island-progress="" data-active={on ? "" : undefined}>
      {on && <span data-island-progress-bar="" />}
    </span>
  );
}

export interface IslandViewportProps extends Omit<HTMLAttributes<HTMLDivElement>, "dir"> {
  position?: IslandPosition;
  mode?: IslandMode;
  /** Vertical distance from the viewport edge (safe area). Defaults automatically per `position` & `mode`. */
  inset?: string;
  /** Horizontal distance from the viewport edge for `*-left` / `*-right` positions. */
  insetX?: string;
  dir?: IslandDirection;
  theme?: IslandTheme;
  children?: ReactNode;
}

/** Optional fixed container anchoring `<Island>` across all 6 viewport positions and Dock mode. */
export function IslandViewport({
  position: positionProp,
  mode: modeProp,
  inset,
  insetX,
  dir: dirProp,
  theme: themeProp,
  style,
  children,
  ...rest
}: IslandViewportProps) {
  const store = useIslandStore();
  const config = useIslandConfig();
  const position = useIslandLayoutField("position", positionProp);
  const mode = useIslandLayoutField("mode", modeProp);
  const theme = useIslandLayoutField("theme", themeProp);
  const explicitTheme = themeProp !== undefined || config.theme !== undefined || store.hasLayoutOverride("theme");
  const resolvedDir = useIslandDirection(dirProp);

  const mergedStyle = {
    ...(inset ? { "--island-inset": inset } : mode === "dock" ? { "--island-inset": "0px" } : null),
    ...(insetX ? { "--island-inset-x": insetX } : null),
    ...style,
  } as CSSProperties;

  return (
    <div
      data-island-viewport=""
      data-position={position}
      data-mode={mode}
      data-dir={resolvedDir}
      dir={resolvedDir}
      data-island-theme={explicitTheme ? theme : undefined}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface IslandDockProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Composable interactive dock row designed to sit inside `<Island>` (`children` or `expanded`). */
export const IslandDock = forwardRef<HTMLDivElement, IslandDockProps>(function IslandDock(
  { children, role = "toolbar", ...rest },
  forwarded,
) {
  return (
    <div ref={forwarded} role={role} data-island-dock="" {...rest}>
      {children}
    </div>
  );
});

export interface IslandDockItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label?: string;
  /** Show text label beside icon (`false` by default for compact macOS-style dock icons). */
  showLabel?: boolean;
  /** Renders the active indicator dot beneath/beside the item. */
  active?: boolean;
  /** Optional notification dot (`true`) or compact badge content (`number` / `ReactNode`). */
  badge?: ReactNode | boolean;
}

/** Interactive button item inside `<IslandDock>` with optional badge and active dot. */
export const IslandDockItem = forwardRef<HTMLButtonElement, IslandDockItemProps>(function IslandDockItem(
  { icon, label, showLabel = false, active = false, badge, children, type = "button", ...rest },
  forwarded,
) {
  const ariaLabel = rest["aria-label"] ?? label;
  return (
    <button
      ref={forwarded}
      type={type}
      data-island-dock-item=""
      data-active={active ? "" : undefined}
      data-labeled={showLabel && label ? "" : undefined}
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      title={rest.title ?? (!showLabel ? label : undefined)}
      {...rest}
    >
      <span data-island-dock-icon="" aria-hidden="true">{icon}</span>
      {showLabel && label && <span data-island-dock-label="">{label}</span>}
      {children}
      {badge !== undefined && badge !== false && (
        <span data-island-dock-badge="" data-dot={badge === true ? "" : undefined} aria-hidden="true">
          {badge === true ? null : badge}
        </span>
      )}
      {active && <span data-island-dock-dot="" aria-hidden="true" />}
    </button>
  );
});

/** Vertical hairline separator inside `<IslandDock>`. */
export function IslandDockDivider(props: HTMLAttributes<HTMLSpanElement>) {
  return <span role="separator" aria-orientation="vertical" data-island-dock-divider="" {...props} />;
}
