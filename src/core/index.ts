/**
 * @upstand/island/core — framework-free island state, 120Hz physics motion
 * adapters, and analytic gooey geometry. No React, no DOM access at import.
 */
import { createIslandApi, getDefaultIslandStore } from "./api";

export { createIslandStore, DEFAULT_DURATIONS, DEFAULT_LAYOUT, EMPTY_ISLAND_STATE } from "./store";
export type { IslandStore, IslandToastInput } from "./store";
export { createIslandApi, getDefaultIslandStore } from "./api";
export type { IslandApi, IslandToastApi } from "./api";
export { buildGooeyPath, computePillX } from "./gooey";
export type { IslandGooeyPathParams } from "./gooey";
export {
  createCssMotion,
  createEasingMotion,
  createSpringMotion,
  easings,
  evaluateSpring,
  ISLAND_MOTIONS,
  resolveMotionAdapter,
  resolveSpringDurationMs,
  resolveSpringParams,
  scheduleMotionTick,
  springToCssLinear,
} from "./motion";
export type {
  CssMotionOptions,
  EasingMotionChannelConfig,
  EasingMotionOptions,
  IslandMotionAdapter,
  IslandMotionChannel,
  IslandMotionCssConfig,
  IslandMotionFrame,
  IslandMotionHandle,
  IslandMotionInput,
  IslandMotionPreset,
  IslandMotionRunOptions,
  IslandSpringConfig,
  ResolvedSpringParams,
  SpringMotionOptions,
} from "./motion";
export { getPositionEdges, ISLAND_POSITIONS } from "./types";
export type * from "./types";

/** Imperative API bound to the default store (framework-free variant). */
export const islandCore = /* @__PURE__ */ createIslandApi(getDefaultIslandStore);
