/**
 * @upstand/island — dynamic-island header, dock, Liquid Glass, 120Hz spring
 * physics, and morphing toasts for React.
 *
 *   import { IslandProvider, Island, IslandToaster, island } from "@upstand/island";
 *   import "@upstand/island/island.css";
 */
import { createIslandApi, getDefaultIslandStore } from "./core/api";
import type { IslandReactToastOptions } from "./react/types";

export * from "./core";
export {
  IslandProvider,
  useIsland,
  useIslandActivity,
  useIslandApi,
  useIslandBusy,
  useIslandConfig,
  useIslandDirection,
  useIslandLayoutField,
  useIslandMode,
  useIslandMotion,
  useIslandPosition,
  useIslandSlot,
  useIslandSlotValue,
  useIslandStore,
  useIslandSurface,
  useIslandToastActive,
} from "./react/context";
export type { IslandConfig, IslandProviderProps } from "./react/context";
export { IslandGlassBackdrop } from "./react/glass";
export type { IslandGlassBackdropHandle, IslandGlassBackdropProps } from "./react/glass";
export { usePrefersReducedMotion } from "./react/hooks";
export {
  Island,
  IslandDock,
  IslandDockDivider,
  IslandDockItem,
  IslandProgress,
  IslandTitle,
  IslandViewport,
} from "./react/island";
export type {
  IslandDockItemProps,
  IslandDockProps,
  IslandProps,
  IslandTitleProps,
  IslandViewportProps,
} from "./react/island";
export { DefaultIslandToastEngine, IslandToaster } from "./react/toaster";
export type { IslandToasterProps } from "./react/toaster";
export type {
  IslandPosition,
  IslandReactToastOptions,
  IslandToastEngine,
  IslandToastEngineProps,
  IslandToastIcons,
} from "./react/types";

/**
 * Imperative API on the shared store, usable anywhere (event handlers, query
 * callbacks, non-React modules):
 *
 *   island.toast.success("Saved");
 *   island.setSurface("liquid-glass");
 *   island.setPosition("bottom-right");
 *   const done = island.busy("Loading older messages"); … done();
 */
export const island = /* @__PURE__ */ createIslandApi<IslandReactToastOptions>(getDefaultIslandStore);
