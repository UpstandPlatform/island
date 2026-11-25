/**
 * Analytic C1-continuous cubic Bezier gooey silhouette geometry for
 * `@upstand/island`, inspired by `aligh98/sileo_flutter`.
 */
import type { IslandHorizontalAlign, IslandVerticalEdge } from "./types";

const ARC_KAPPA = 0.5522847498307936;

export interface IslandGooeyPathParams {
  /** Total bounding width in px. */
  width: number;
  /** Header pill height in px. */
  pillHeight: number;
  /** Left offset of the pill inside `[0, width]`. */
  pillX: number;
  /** Width of the pill inside `[0, width]`. */
  pillWidth: number;
  /** Current animated body height in px (`0` when collapsed). */
  bodyHeight: number;
  /** Corner radius and concave neck fillet radius in px. */
  roundness: number;
  /** Expand body downward (`top-*`, default `true`) or upward (`bottom-*`). */
  expandDownward?: boolean;
  /** Optional edge flush-docking so the outer rim attaches seamlessly to the viewport edge. */
  dockedEdge?: IslandVerticalEdge | null;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

/** Format a number cleanly to max 3 decimal places without trailing zeroes. */
const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Compute the pill's horizontal offset inside `toastWidth` for `left` / `center` / `right`. */
export function computePillX(
  toastWidth: number,
  pillWidth: number,
  horizontal: IslandHorizontalAlign,
): number {
  const safeW = Math.max(0, finite(toastWidth, 0));
  const safePill = clamp(finite(pillWidth, 0), 0, safeW);
  const maxOffset = Math.max(0, safeW - safePill);
  switch (horizontal) {
    case "left":
      return 0;
    case "right":
      return maxOffset;
    case "center":
    default:
      return maxOffset / 2;
  }
}

/**
 * Build an SVG path string (`d`) describing the unified pill-and-body liquid
 * silhouette with C1-continuous concave necks and circular corner arcs.
 */
export function buildGooeyPath(params: IslandGooeyPathParams): string {
  const expandDownward = params.expandDownward ?? true;
  const w = Math.max(1, finite(params.width, 1));
  const h = Math.max(1, finite(params.pillHeight, 40));
  const wp = clamp(finite(params.pillWidth, h), Math.min(h, w), w);
  const xl = clamp(finite(params.pillX, 0), 0, Math.max(0, w - wp));
  const xr = xl + wp;
  const b = Math.max(0, finite(params.bodyHeight, 0));
  const r = clamp(finite(params.roundness, 16), 0, Math.min(h / 2, w / 2));
  const totalH = h + b;

  const dockPillOuterEdge =
    (params.dockedEdge === "top" && expandDownward) ||
    (params.dockedEdge === "bottom" && !expandDownward);

  // Flip Y vertically for upward-expanding toasts (`bottom-*`) while keeping arc sweeps valid.
  const fy = (y: number) => (expandDownward ? y : totalH - y);
  const pt = (x: number, y: number) => `${fmt(x)} ${fmt(fy(y))}`;
  const sweep = expandDownward ? 1 : 0;

  const arc = (parts: string[], ex: number, ey: number, radius: number) => {
    if (radius > 0.01) {
      parts.push(`A ${fmt(radius)} ${fmt(radius)} 0 0 ${sweep} ${pt(ex, ey)}`);
    } else {
      parts.push(`L ${pt(ex, ey)}`);
    }
  };

  // Smooth cubic emergence over a merge zone so shoulders never snap.
  const attachDeadzone = 2.0;
  const mergeH = Math.max(52.0, r * 3.4);
  const rawT = clamp((b - attachDeadzone) / Math.max(1, mergeH - attachDeadzone), 0, 1);
  const widthT = rawT * rawT * (3.0 - 2.0 * rawT);

  const bL = xl + (0 - xl) * widthT;
  const bR = xr + (w - xr) * widthT;

  const gapL = xl - bL;
  const gapR = bR - xr;
  const hasLeftStep = gapL > 0.05;
  const hasRightStep = gapR > 0.05;

  const effectiveBL = hasLeftStep ? bL : xl;
  const effectiveBR = hasRightStep ? bR : xr;
  const wb = Math.max(1, effectiveBR - effectiveBL);

  // Pure pill fast-path when body width matches the pill.
  if (!hasLeftStep && !hasRightStep) {
    const rTop = dockPillOuterEdge ? 0 : Math.min(r, totalH / 2, wp / 2);
    const rBot = Math.min(r, totalH / 2, wp / 2);
    const parts: string[] = [
      `M ${pt(xl + rTop, 0)}`,
      `L ${pt(xr - rTop, 0)}`,
    ];
    arc(parts, xr, rTop, rTop);
    parts.push(`L ${pt(xr, totalH - rBot)}`);
    arc(parts, xr - rBot, totalH, rBot);
    parts.push(`L ${pt(xl + rBot, totalH)}`);
    arc(parts, xl, totalH - rBot, rBot);
    parts.push(`L ${pt(xl, rTop)}`);
    arc(parts, xl + rTop, 0, rTop);
    parts.push("Z");
    return parts.join(" ");
  }

  const maxPillCorner = Math.min(r, h / 2, wp / 2);
  const rPtl = dockPillOuterEdge ? 0 : maxPillCorner;
  const rPtr = dockPillOuterEdge ? 0 : maxPillCorner;

  const rBot = Math.min(r, totalH / 2, wb / 2);
  const yBotCornerTop = totalH - rBot;

  // Right C1 liquid shoulder
  const cMaxR = Math.min(r, Math.max(0, h - rPtr));
  const yEndR = Math.max(rPtr, Math.min(h + r, yBotCornerTop));
  const maxSpanR = Math.max(0, yEndR - rPtr);
  const spanR = Math.min(cMaxR + r, maxSpanR);
  const yStartR = r <= 0 ? h : yEndR - spanR;
  const yMidR = r <= 0 ? h : (yStartR + yEndR) / 2;
  const ryR = r <= 0 ? 0 : (yEndR - yStartR) / 2;
  const rxR = Math.min(ryR, gapR / 2);

  // Left C1 liquid shoulder
  const cMaxL = Math.min(r, Math.max(0, h - rPtl));
  const yEndL = Math.max(rPtl, Math.min(h + r, yBotCornerTop));
  const maxSpanL = Math.max(0, yEndL - rPtl);
  const spanL = Math.min(cMaxL + r, maxSpanL);
  const yStartL = r <= 0 ? h : yEndL - spanL;
  const yMidL = r <= 0 ? h : (yStartL + yEndL) / 2;
  const ryL = r <= 0 ? 0 : (yEndL - yStartL) / 2;
  const rxL = Math.min(ryL, gapL / 2);

  const parts: string[] = [
    `M ${pt(xl + rPtl, 0)}`,
    `L ${pt(xr - rPtr, 0)}`,
  ];

  // Pill top-right convex corner (flattened if flush-docked)
  arc(parts, xr, rPtr, rPtr);

  // Right wall and C1 liquid shoulder
  if (hasRightStep) {
    parts.push(`L ${pt(xr, yStartR)}`);
    if (rxR > 0.01 && ryR > 0.01) {
      parts.push(
        `C ${pt(xr, yStartR + ryR * ARC_KAPPA)} ${pt(xr + rxR * (1 - ARC_KAPPA), yMidR)} ${pt(xr + rxR, yMidR)}`,
      );
      if (effectiveBR - rxR > xr + rxR + 0.01) {
        parts.push(`L ${pt(effectiveBR - rxR, yMidR)}`);
      }
      parts.push(
        `C ${pt(effectiveBR - rxR * (1 - ARC_KAPPA), yMidR)} ${pt(effectiveBR, yEndR - ryR * ARC_KAPPA)} ${pt(effectiveBR, yEndR)}`,
      );
    } else {
      parts.push(`L ${pt(xr, yMidR)}`, `L ${pt(effectiveBR, yMidR)}`);
    }
  }

  parts.push(`L ${pt(effectiveBR, yBotCornerTop)}`);
  arc(parts, effectiveBR - rBot, totalH, rBot);
  parts.push(`L ${pt(effectiveBL + rBot, totalH)}`);
  arc(parts, effectiveBL, yBotCornerTop, rBot);

  // Left wall and C1 liquid shoulder
  if (hasLeftStep) {
    parts.push(`L ${pt(effectiveBL, yEndL)}`);
    if (rxL > 0.01 && ryL > 0.01) {
      parts.push(
        `C ${pt(effectiveBL, yEndL - ryL * ARC_KAPPA)} ${pt(effectiveBL + rxL * (1 - ARC_KAPPA), yMidL)} ${pt(effectiveBL + rxL, yMidL)}`,
      );
      if (xl - rxL > effectiveBL + rxL + 0.01) {
        parts.push(`L ${pt(xl - rxL, yMidL)}`);
      }
      parts.push(
        `C ${pt(xl - rxL * (1 - ARC_KAPPA), yMidL)} ${pt(xl, yStartL + ryL * ARC_KAPPA)} ${pt(xl, yStartL)}`,
      );
    } else {
      parts.push(`L ${pt(effectiveBL, yMidL)}`, `L ${pt(xl, yMidL)}`);
    }
  }

  parts.push(`L ${pt(xl, rPtl)}`);
  arc(parts, xl + rPtl, 0, rPtl);
  parts.push("Z");

  return parts.join(" ");
}
