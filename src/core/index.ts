/**
 * @upstand/island/core — framework-free island state: ref-counted busy
 * activity, a toast queue, slots and events. No React, no DOM access.
 */
import { createIslandApi, getDefaultIslandStore } from "./api";

export { createIslandStore, DEFAULT_DURATIONS, EMPTY_ISLAND_STATE } from "./store";
export type { IslandStore, IslandToastInput } from "./store";
export { createIslandApi, getDefaultIslandStore } from "./api";
export type { IslandApi, IslandToastApi } from "./api";
export type * from "./types";

/** Imperative API bound to the default store (framework-free variant). */
export const islandCore = /* @__PURE__ */ createIslandApi(getDefaultIslandStore);
