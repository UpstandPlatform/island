import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { IslandToast, IslandToastAction, IslandToastType } from "../core/types";
import { useIsland, useIslandStore } from "./context";
import type { IslandPosition, IslandToastEngine, IslandToastEngineProps } from "./types";

export interface IslandToasterProps {
  /** Renderer. Defaults to the built-in island toast; pass `sileoEngine` from `@upstand/island/sileo` for sileo. */
  engine?: IslandToastEngine;
  /** Default `"top-center"`. */
  position?: IslandPosition;
  /**
   * CSS length from the viewport edge to the island's outer edge. Match it to
   * where your island sits so the toast opens right on top of it.
   * Defaults to `calc(env(safe-area-inset-top, 0px) + 0.5rem)` for `"top-center"`
   * and `calc(env(safe-area-inset-bottom, 0px) + 0.5rem)` for `"bottom-center"`.
   */
  inset?: string;
  /** Swipe toward the edge to dismiss. Default `true`. */
  swipeToDismiss?: boolean;
  /** Accessible label for a close button (none when omitted; the package ships no strings). */
  closeLabel?: string;
}

const DEFAULT_TOP_INSET = "calc(env(safe-area-inset-top, 0px) + 0.5rem)";
const DEFAULT_BOTTOM_INSET = "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)";

function plainText(toast: IslandToast) {
  return [toast.title, typeof toast.description === "string" ? toast.description : null].filter(Boolean).join(". ");
}

/** Mounts the toast renderer and screen-reader announcements. Render it once. */
export function IslandToaster({
  engine: Engine = DefaultIslandToastEngine,
  position = "top-center",
  inset,
  swipeToDismiss = true,
  closeLabel,
}: IslandToasterProps) {
  const store = useIslandStore();
  const toast = useIsland((state) => state.toast);
  const announces = Engine.announces ?? "none";
  const resolvedInset = inset ?? (position === "bottom-center" ? DEFAULT_BOTTOM_INSET : DEFAULT_TOP_INSET);

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
      <Engine toast={toast} store={store} position={position} inset={resolvedInset} swipeToDismiss={swipeToDismiss} closeLabel={closeLabel} />
      <div data-island-sr="" aria-live="polite" aria-atomic="true">{polite}</div>
      <div data-island-sr="" aria-live="assertive" aria-atomic="true">{assertive}</div>
    </>
  );
}

const EXIT_MS = 450;
const SWIPE_DISMISS_PX = 28;

/** Built-in renderer: a pill that grows out of the island's spot. */
export const DefaultIslandToastEngine: IslandToastEngine = function DefaultIslandToastEngine({ toast, store, position, inset, swipeToDismiss, closeLabel }: IslandToastEngineProps) {
  // Keep the last toast mounted while it animates out.
  const [shown, setShown] = useState<IslandToast | null>(toast);
  const [leaving, setLeaving] = useState(false);
  const shownRef = useRef<IslandToast | null>(toast);
  const pausedBySelf = useRef(false);

  useEffect(() => {
    if (toast) {
      shownRef.current = toast;
      setShown(toast);
      setLeaving(false);
      return;
    }
    if (!shownRef.current) return;
    setLeaving(true);
    const timer = setTimeout(() => {
      shownRef.current = null;
      setShown(null);
      setLeaving(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const pause = () => {
    if (pausedBySelf.current) return;
    pausedBySelf.current = true;
    store.pause();
  };

  const resume = () => {
    if (!pausedBySelf.current) return;
    pausedBySelf.current = false;
    store.resume();
  };

  useEffect(() => {
    if (leaving) resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  useEffect(() => () => {
    if (pausedBySelf.current) {
      pausedBySelf.current = false;
      store.resume();
    }
  }, [store]);

  const node = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; delta: number; pointer: number } | null>(null);
  const towardEdge = position === "top-center" ? -1 : 1;

  if (!shown) return null;
  const dismissible = shown.dismissible !== false;
  const body: ReactNode = (shown.content as ReactNode) ?? (shown.description as ReactNode);
  const hasBody = (body !== undefined && body !== null && body !== "") || Boolean(shown.action);
  const isPureCustom = shown.type === "custom" && !shown.title && shown.icon === undefined;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeToDismiss || !dismissible || leaving) return;
    if ((event.target as HTMLElement).closest("button,a,input,textarea,select")) return;
    drag.current = { start: event.clientY, delta: 0, pointer: event.pointerId };
    node.current?.setAttribute("data-dragging", "");
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    const raw = event.clientY - state.start;
    // Free movement toward the edge, rubber band the other way.
    state.delta = raw * towardEdge > 0 ? raw : raw * 0.2;
    node.current?.style.setProperty("--island-swipe", `${state.delta}px`);
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    drag.current = null;
    node.current?.removeAttribute("data-dragging");
    node.current?.style.removeProperty("--island-swipe");
    if (state.delta * towardEdge >= SWIPE_DISMISS_PX) {
      store.haptic("light");
      store.dismiss(shown.id, "swipe");
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resume();
  };

  const closeButton = dismissible && closeLabel ? (
    <button type="button" data-island-toast-close="" aria-label={closeLabel} onClick={() => store.dismiss(shown.id, "user")}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </button>
  ) : null;

  const actionButton = shown.action ? (
    <ToastActionButton action={shown.action} type={shown.type} onDismiss={() => store.dismiss(shown.id, "user")} />
  ) : null;

  return (
    <div data-island-toaster="" data-position={position} style={{ "--island-inset": inset } as CSSProperties}>
      <div
        ref={node}
        key={shown.id}
        data-island-toast=""
        data-type={shown.type}
        data-state={leaving ? "closed" : "open"}
        data-expanded={hasBody || isPureCustom ? "" : undefined}
        onPointerEnter={pause}
        onPointerLeave={resume}
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
        {isPureCustom ? (
          <div data-island-toast-custom="">
            {shown.content as ReactNode}
            {actionButton}
            {closeButton}
          </div>
        ) : (
          <>
            <div data-island-toast-header="">
              {(shown.icon !== undefined || shown.type !== "custom") && (
                <span data-island-toast-icon="" data-type={shown.type} aria-hidden="true">
                  {(shown.icon as ReactNode) ?? <ToastIcon type={shown.type} />}
                </span>
              )}
              <span data-island-toast-title="" key={shown.version}>{shown.title}</span>
              {closeButton}
            </div>
            {hasBody && (
              <div data-island-toast-body="">
                <div data-island-toast-body-inner="">
                  {body !== undefined && body !== null && body !== "" && <div data-island-toast-description="">{body}</div>}
                  {actionButton}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
DefaultIslandToastEngine.announces = "none";

function ToastActionButton({ action, type, onDismiss }: { action: IslandToastAction; type: IslandToastType; onDismiss: () => void }) {
  return (
    <button
      type="button"
      data-island-toast-action=""
      data-type={type}
      onClick={() => {
        action.onClick();
        if (action.dismiss !== false) onDismiss();
      }}
    >
      {action.label}
    </button>
  );
}

function ToastIcon({ type }: { type: IslandToastType }) {
  const common = { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
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
    case "info":
      return <svg {...common}><path d="M8 7v5M8 4.5v.5" /></svg>;
    default:
      return null;
  }
}
