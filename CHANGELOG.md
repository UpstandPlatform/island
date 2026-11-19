# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
