import { forwardRef, useId, useImperativeHandle, useMemo, useRef, type CSSProperties } from "react";

import type { IslandGlassOptions, IslandVerticalEdge } from "../core/types";

export interface IslandGlassBackdropProps {
  variant: "capsule" | "gooey";
  glass?: IslandGlassOptions;
  isDark: boolean;
  dockedEdge?: IslandVerticalEdge | null;
  initialPath?: string;
  width?: number;
  height?: number;
}

export interface IslandGlassBackdropHandle {
  updateGooey: (path: string, width: number, height: number) => void;
  setReveal: (opacity: number) => void;
}

function buildMaskDataUri(path: string, w: number, h: number): string {
  const sw = Math.max(1, Number(w.toFixed(2)));
  const sh = Math.max(1, Number(h.toFixed(2)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}"><path d="${path}" fill="#000"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Zero-artifact, cross-browser GPU Liquid Glass surface shared across `<Island>`
 * (capsule mode) and `<IslandToaster>` (analytic gooey silhouette mode).
 */
export const IslandGlassBackdrop = forwardRef<IslandGlassBackdropHandle, IslandGlassBackdropProps>(
  function IslandGlassBackdrop(
    { variant, glass, isDark, initialPath = "", width = 180, height = 40 },
    ref,
  ) {
    const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const clipId = `island-lg-clip-${rawId}`;
    const gradId = `island-lg-rim-${rawId}`;
    const bevelId = `island-lg-bevel-${rawId}`;
    const prismId = `island-lg-prism-${rawId}`;

    const rootRef = useRef<HTMLDivElement>(null);
    const layerRef = useRef<HTMLDivElement>(null);
    const rimSvgRef = useRef<SVGSVGElement>(null);
    const clipPathRef = useRef<SVGPathElement>(null);
    const rimBevelRef = useRef<SVGPathElement>(null);
    const rimPrismRef = useRef<SVGPathElement>(null);
    const rimOuterRef = useRef<SVGPathElement>(null);
    const lastMaskKeyRef = useRef("");

    const blur = Math.max(0, glass?.blur ?? 12);
    const saturation = Math.max(0.5, glass?.saturation ?? 1.8);
    const refraction = Math.max(0, Math.min(2.5, glass?.refraction ?? 1.15));
    const dispersion = Math.max(0, Math.min(2, glass?.dispersion ?? 0.75));
    const specular = Math.max(0, Math.min(2, glass?.specular ?? 1));
    const lite = Boolean(glass?.lite);

    useImperativeHandle(
      ref,
      () => ({
        updateGooey(path: string, w: number, h: number) {
          const safeW = Math.max(1, w);
          const safeH = Math.max(1, h);
          const key = `${path}|${safeW.toFixed(2)}|${safeH.toFixed(2)}`;
          if (lastMaskKeyRef.current !== key) {
            lastMaskKeyRef.current = key;
            const layer = layerRef.current;
            if (layer && path) {
              const maskUrl = buildMaskDataUri(path, safeW, safeH);
              layer.style.maskImage = maskUrl;
              layer.style.webkitMaskImage = maskUrl;
            }
            const svg = rimSvgRef.current;
            if (svg) {
              svg.setAttribute("viewBox", `0 0 ${safeW.toFixed(2)} ${safeH.toFixed(2)}`);
            }
            clipPathRef.current?.setAttribute("d", path);
            rimBevelRef.current?.setAttribute("d", path);
            rimPrismRef.current?.setAttribute("d", path);
            rimOuterRef.current?.setAttribute("d", path);
          }
        },
        setReveal(opacity: number) {
          const el = rootRef.current;
          if (el) {
            el.style.opacity = String(Math.min(1, Math.max(0, opacity)));
          }
        },
      }),
      [],
    );

    const contrast = lite || refraction <= 0 ? 1 : Number((1 + refraction * 0.05).toFixed(3));
    const brightness = lite || refraction <= 0 ? 1 : Number((1 + refraction * (isDark ? 0.07 : 0.03)).toFixed(3));

    const backdropFilterValue =
      contrast !== 1 || brightness !== 1
        ? `blur(${blur}px) saturate(${saturation}) contrast(${contrast}) brightness(${brightness})`
        : `blur(${blur}px) saturate(${saturation})`;

    const backdropVars = {
      ...(glass?.blur !== undefined ? { "--island-glass-blur": `${blur}px` } : null),
      ...(glass?.saturation !== undefined ? { "--island-glass-saturation": String(saturation) } : null),
      ...(glass?.tint !== undefined ? { "--island-glass-tint": glass.tint } : null),
    } as CSSProperties;

    const rimTopColor = isDark
      ? `rgba(255, 255, 255, ${Math.min(1, 0.44 * specular)})`
      : `rgba(255, 255, 255, ${Math.min(1, 0.92 * specular)})`;
    const rimMidColor = isDark
      ? `rgba(255, 255, 255, ${Math.min(1, 0.1 * specular)})`
      : `rgba(255, 255, 255, ${Math.min(1, 0.34 * specular)})`;
    const rimBotColor = isDark
      ? `rgba(255, 255, 255, ${Math.min(1, 0.24 * specular)})`
      : `rgba(255, 255, 255, ${Math.min(1, 0.7 * specular)})`;

    const bevelTopColor = isDark
      ? `rgba(255, 255, 255, ${Math.min(1, 0.24 * specular)})`
      : `rgba(255, 255, 255, ${Math.min(1, 0.56 * specular)})`;
    const bevelBotColor = isDark
      ? `rgba(255, 255, 255, ${Math.min(1, 0.1 * specular)})`
      : `rgba(255, 255, 255, ${Math.min(1, 0.28 * specular)})`;

    const bevelWidth = Math.max(2, refraction * 4.5);
    const prismWidth = Math.max(1.5, refraction * 2.8);
    const prismOpacity = Math.min(0.45, dispersion * 0.28);
    const showOpticalBevel = !lite && specular > 0 && refraction > 0;
    const showPrism = !lite && dispersion > 0.05;
    // Freeze initial JSX SVG/mask props so React re-renders never overwrite imperative 120Hz `updateGooey` state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const mountSvg = useMemo(
      () => ({
        path: initialPath,
        viewBox: `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`,
        maskUrl: variant === "gooey" && initialPath ? buildMaskDataUri(initialPath, width, height) : undefined,
      }),
      [],
    );

    return (
      <div
        ref={rootRef}
        data-island-glass-backdrop=""
        data-variant={variant}
        data-lite={lite ? "" : undefined}
        aria-hidden="true"
        style={backdropVars}
      >
        <div
          ref={layerRef}
          data-island-glass-layer=""
          style={{
            backdropFilter: backdropFilterValue,
            WebkitBackdropFilter: backdropFilterValue,
            ...(mountSvg.maskUrl ? { maskImage: mountSvg.maskUrl, WebkitMaskImage: mountSvg.maskUrl } : null),
          }}
        >
          <div data-island-glass-tint="" />
          <div
            data-island-glass-sheen=""
            data-variant={variant}
            style={{ opacity: specular > 0 ? Math.min(1, 0.65 + specular * 0.35) : 0 }}
          />
          {variant === "capsule" && showPrism && (
            <div data-island-glass-prism="" style={{ opacity: prismOpacity }} />
          )}
        </div>

        {variant === "gooey" && specular > 0 && (
          <svg
            ref={rimSvgRef}
            data-island-glass-rim=""
            viewBox={mountSvg.viewBox}
            aria-hidden="true"
          >
            <defs>
              <clipPath id={clipId}>
                <path ref={clipPathRef} d={mountSvg.path} />
              </clipPath>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={rimTopColor} />
                <stop offset="46%" stopColor={rimMidColor} />
                <stop offset="100%" stopColor={rimBotColor} />
              </linearGradient>
              <linearGradient id={bevelId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={bevelTopColor} />
                <stop offset="50%" stopColor="rgba(255, 255, 255, 0.02)" />
                <stop offset="100%" stopColor={bevelBotColor} />
              </linearGradient>
              <linearGradient id={prismId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            {showOpticalBevel && (
              <g clipPath={`url(#${clipId})`}>
                <path
                  ref={rimBevelRef}
                  d={mountSvg.path}
                  fill="none"
                  stroke={`url(#${bevelId})`}
                  strokeWidth={bevelWidth}
                />
                {showPrism && (
                  <path
                    ref={rimPrismRef}
                    d={mountSvg.path}
                    fill="none"
                    stroke={`url(#${prismId})`}
                    strokeOpacity={prismOpacity}
                    strokeWidth={prismWidth}
                  />
                )}
              </g>
            )}
            <path
              ref={rimOuterRef}
              d={mountSvg.path}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="1.25"
            />
          </svg>
        )}
      </div>
    );
  },
);
