import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import { useIsland, useIslandToastActive } from "./context";

export interface IslandProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
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
  /** Content revealed below the bar when `open`. */
  expanded?: ReactNode;
  open?: boolean;
  /** Fade and stretch out while a toast owns the island. Default `true`. */
  hideOnToast?: boolean;
  /** Screen-reader text while busy without a label (the package ships no strings). */
  busyFallbackLabel?: string;
  /** Replaces the title + badge region, e.g. to wrap them in a link. Use `<IslandTitle>` inside. */
  children?: ReactNode;
}

/**
 * Headless dynamic island. Renders structure and `data-*` state only; import
 * `@upstand/island/island.css` for the default look, or style the
 * `[data-island…]` attributes yourself.
 */
export const Island = forwardRef<HTMLDivElement, IslandProps>(function Island(
  { leading, title, badge, trailing, progress = "auto", expanded, open = false, hideOnToast = true, busyFallbackLabel, children, style, ...rest },
  forwarded,
) {
  const ref = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLDivElement, []);
  const toastActive = useIslandToastActive();
  const busy = useIsland((state) => state.busy);
  const busyLabel = useIsland((state) => state.busyLabel);
  const hidden = hideOnToast && toastActive;
  const showBusy = busy && !hidden;
  const isOpen = open && expanded !== undefined;
  const showProgress = progress === "auto" ? true : progress;

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

  return (
    <div
      ref={ref}
      data-island=""
      data-toast-active={toastActive ? "" : undefined}
      data-hidden={hidden ? "" : undefined}
      data-busy={showBusy ? "" : undefined}
      data-open={isOpen ? "" : undefined}
      aria-hidden={hidden || undefined}
      aria-busy={showBusy || undefined}
      style={style as CSSProperties}
      {...rest}
    >
      <div data-island-bar="">
        {leading}
        {children ?? (
          <div data-island-body="">
            <IslandTitle>{title}</IslandTitle>
            {badge}
          </div>
        )}
        {trailing}
      </div>
      {expanded !== undefined && (
        <div ref={expandedRef} data-island-expanded="" data-open={isOpen ? "" : undefined} aria-hidden={!isOpen || undefined}>
          <div data-island-expanded-inner="">{expanded}</div>
        </div>
      )}
      <span role="status" data-island-sr="">{showBusy ? busyLabel ?? busyFallbackLabel ?? "" : ""}</span>
      {showProgress && <IslandProgress active={showBusy} />}
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

export interface IslandViewportProps extends HTMLAttributes<HTMLDivElement> {
  position?: "top-center" | "bottom-center";
  /** Distance from the viewport edge (safe area). Defaults to `calc(env(safe-area-inset-top | bottom, 0px) + 0.5rem)`. */
  inset?: string;
  children?: ReactNode;
}

/** Optional fixed, centred container for the island (use it when your app has no header of its own). */
export function IslandViewport({ position = "top-center", inset, style, children, ...rest }: IslandViewportProps) {
  return (
    <div
      data-island-viewport=""
      data-position={position}
      style={{ ...(inset ? { "--island-inset": inset } : null), ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </div>
  );
}
