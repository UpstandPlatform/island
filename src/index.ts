/**
 * @upstand/island — dynamic-island header and toasts for React.
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
  useIslandSlot,
  useIslandSlotValue,
  useIslandStore,
  useIslandToastActive,
} from "./react/context";
export type { IslandProviderProps } from "./react/context";
export { Island, IslandProgress, IslandTitle, IslandViewport } from "./react/island";
export type { IslandProps, IslandTitleProps, IslandViewportProps } from "./react/island";
export { DefaultIslandToastEngine, IslandToaster } from "./react/toaster";
export type { IslandToasterProps } from "./react/toaster";
export type { IslandPosition, IslandReactToastOptions, IslandToastEngine, IslandToastEngineProps } from "./react/types";

/**
 * Imperative API on the shared store, usable anywhere (event handlers, query
 * callbacks, non-React modules):
 *
 *   island.toast.success("Saved");
 *   const done = island.busy("Loading older messages"); … done();
 */
export const island = /* @__PURE__ */ createIslandApi<IslandReactToastOptions>(getDefaultIslandStore);
