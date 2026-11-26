# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Size the default toast from the same CSS tokens as the island: the pill height follows `--island-height` and the toast width follows `--island-toast-max-width`, instead of hard-coded 40px / 352px. Apps that resize the island now get a toast that lines up with it.
- Re-apply the dark palette for `data-island-theme="dark"` (and `"system"` in a dark OS theme), so a dark island or toaster renders dark under a light-themed ancestor.
- Use the island title size (`0.875rem`) for toast titles so the title does not jump when the island hands over to a toast.
- Stop the loading-toast spinner under `prefers-reduced-motion: reduce`.

## [0.2.2] - 2026-11-26

### Fixed

- Keep expanded panels within the visible viewport as the keyboard opens, the page scrolls, or the viewport changes size.
- Keep the panel height limit in place during collapse and account for safe-area padding in docked layouts.

## [0.2.1] - 2026-11-25

### Fixed

- Calibrate spring presets so configured durations match the actual settling time; shorten built-in interaction timings and expose separate expand/collapse CSS timing tokens.
- Stop `ResizeObserver` feedback from retargeting capsule width/height on each intermediate frame; expanded panels now own both size axes through CSS grid animation.
- Coalesce simultaneous motion channels into a single DOM flush per display frame, replace per-frame glass data-URL masks with a shared SVG clip path, and throttle swipe rendering to display frames.
- Remove blur filters from active transitions, normalize dock/toast controls against page-wide button styles, improve toast detail-toggle keyboard access, and keep collapsed toast actions out of the tab order.

## [0.2.0] - 2026-11-25

### Added

- **120Hz analytical spring physics & pluggable motion adapters** (`@upstand/island` and `@upstand/island/motion`):
  - Analytical frame-rate-independent spring solver (`evaluateSpring`, `resolveSpringParams`, `resolveSpringDurationMs`, `springToCssLinear`, `scheduleMotionTick`) supporting 60Hz, 120Hz, and 240Hz+ displays with velocity continuity on mid-flight interruptions.
  - Six built-in presets in `ISLAND_MOTIONS`: `bouncy` (default), `smooth`, `snappy`, `elastic`, `gentle`, and `instant`.
  - Adapter factories (`createSpringMotion`, `createEasingMotion`, `createCssMotion`, `easings`) and the `IslandMotionAdapter` interface for plugging in custom physics or external animation drivers.
  - `useAutoMorph` and `useMotionController` for smooth 120Hz capsule resizing and state transitions, toggleable via `autoMorph` on `<Island>`.
- **Analytic C1-continuous gooey toast engine** (`DefaultIslandToastEngine`):
  - `buildGooeyPath` and `computePillX` generating C1-continuous cubic Bezier silhouettes for floating and edge-docked toasts expanding downward or upward.
  - `autopilot` timed expand/collapse (`boolean | { expand?: number; collapse?: number }`), collapse-before-swap morphing, blur-crossfade headers, configurable `roundness`, per-toast `styles`/`fill`, and velocity-tracked swipe-to-dismiss with spring snap-back.
- **Solid & live Liquid Glass surfaces**:
  - Configurable `surface="solid" | "liquid-glass"` globally on `<IslandProvider>` / `store` / `island`, on `<Island>` / `<IslandToaster>`, or per toast.
  - `<IslandGlassBackdrop>` (`variant="capsule" | "gooey"`) combining GPU `backdrop-filter`, cached SVG `data:image/svg+xml` gooey masks, Fresnel bevel, chromatic dispersion border, and specular rim with `IslandGlassOptions` (`blur`, `saturation`, `refraction`, `dispersion`, `specular`, `tint`, `lite`).
- **Full RTL support**:
  - `dir="auto" | "ltr" | "rtl"` with live ancestor `[dir]` observation (`useResolvedDirection`, `useIslandDirection`), logical inline padding, reversed progress sweep animations, and physical left/center/right viewport coordinates.
- **6-position system & Dock mode**:
  - `ISLAND_POSITIONS`: `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, and `bottom-right` with automatic downward vs. upward expansion via `getPositionEdges`.
  - `mode="floating" | "dock"` with flush edge-attached styling and safe-area offsets, plus composable `<IslandDock>`, `<IslandDockItem>`, and `<IslandDockDivider>` primitives.
- **Layout store & React hooks**:
  - Imperative mutators `setPosition`, `setMode`, `setSurface`, `setDir`, `setTheme` and the `"layout"` store event.
  - Hooks: `useIslandConfig`, `useIslandLayoutField`, `useIslandPosition`, `useIslandMode`, `useIslandSurface`, `useIslandDirection`, `useIslandMotion`, `usePrefersReducedMotion`.

### Changed

- `<Island>` now wraps `[data-island]` inside `[data-island-anchor]` and wraps present `leading`, `trailing`, and `badge` slots in `[data-island-leading]`, `[data-island-trailing]`, and `[data-island-badge]` for directional viewport-safe expansion and concentric non-shrinking alignment.
- `createSileoEngine` (`@upstand/island/sileo`) updated for all 6 viewport positions, `dir`, `theme`, `roundness`, and `autopilot`.

### Fixed

- Fixed `<Island open expanded={...} />` expanding vertically out of the top/bottom viewport edge when centered in a fixed header or footer; `[data-island-anchor]` now pins bar height while opening strictly toward the viewport interior with max-height scroll clamping.
- Fixed `leading`, `trailing`, `badge`, and SVG icons shrinking under flex pressure on long titles/busy labels or narrow containers.
- Fixed `DefaultIslandToastEngine` React hook ordering across empty-to-open transitions and host-container width clamping (`--island-toast-max-width`) on first open.

## [0.1.0] - 2026-11-19

### Added

- Framework-free core (`@upstand/island/core`) with:
  - ref-counted busy activity, where the newest label wins
  - a toast store with `replace` or `queue` strategies, `maxQueue`, per-type durations, pause and resume, and promise toasts
  - slots and events
  - a stable SSR snapshot
- React bindings: `IslandProvider`; headless `Island` with leading, title, badge, trailing, progress and expanded slots; `IslandTitle`, `IslandProgress`, `IslandViewport`; `IslandToaster` with a built-in renderer.
- Hooks: `useIsland`, `useIslandApi`, `useIslandBusy`, `useIslandActivity`, `useIslandToastActive`, `useIslandSlot`, `useIslandSlotValue`.
- Imperative `island.toast.{success,error,warning,info,loading,action,custom,update,dismiss,promise}` and `island.busy(label)`.
- Optional sileo engine (`@upstand/island/sileo`) that routes toasts through a single sileo slot so they morph from the island.
- `island.css` with:
  - `--island-*` tokens and light, dark and system palettes
  - reduced-motion and RTL support
- Haptics callback (`onHaptic`), swipe to dismiss, and assertive announcements for errors.
