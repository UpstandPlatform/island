import { describe, expect, test } from "bun:test";

import {
  createCssMotion,
  createEasingMotion,
  createSpringMotion,
  easings,
  evaluateSpring,
  ISLAND_MOTIONS,
  resolveMotionAdapter,
  resolveSpringDurationMs,
  resolveSpringParams,
  springToCssLinear,
  type IslandMotionAdapter,
} from "../src/core/motion";

describe("analytical spring solver", () => {
  test("resolves underdamped, critically damped, and overdamped regimes", () => {
    const bouncy = resolveSpringParams({ duration: 600, bounce: 0.25 });
    const smooth = resolveSpringParams({ duration: 480, bounce: 0 });
    const heavy = resolveSpringParams({ duration: 500, bounce: -0.45 });
    const explicit = resolveSpringParams({ stiffness: 320, damping: 24, mass: 1 });

    expect(bouncy.zeta).toBeCloseTo(0.75, 4);
    expect(smooth.zeta).toBeCloseTo(1, 4);
    expect(heavy.zeta).toBeGreaterThan(1.5);
    expect(explicit.stiffness).toBe(320);
    expect(explicit.damping).toBe(24);
  });

  test("underdamped bouncy spring overshoots target and settles cleanly", () => {
    const bouncy = { duration: 600, bounce: 0.25 };
    let maxVal = 0;
    for (let ms = 0; ms <= 900; ms += 8) {
      const f = evaluateSpring(bouncy, 0, 100, 0, ms / 1000);
      if (f.value > maxVal) maxVal = f.value;
    }
    expect(maxVal).toBeGreaterThan(100.5);
    const settled = evaluateSpring(bouncy, 0, 100, 0, 2.0);
    expect(settled).toEqual({ value: 100, velocity: 0, done: true });
  });

  test("critically damped smooth spring approaches target monotonically without overshoot", () => {
    const smooth = { duration: 480, bounce: 0 };
    let maxVal = 0;
    for (let ms = 0; ms <= 1000; ms += 4) {
      const f = evaluateSpring(smooth, 0, 100, 0, ms / 1000);
      if (f.value > maxVal) maxVal = f.value;
      expect(f.value).toBeGreaterThanOrEqual(0);
    }
    expect(maxVal).toBeLessThanOrEqual(100.001);
  });

  test("overdamped spring never overshoots and settles cleanly", () => {
    const heavy = { duration: 480, bounce: -0.5 };
    let maxVal = 0;
    for (let ms = 0; ms <= 3000; ms += 10) {
      const f = evaluateSpring(heavy, 0, 100, 0, ms / 1000);
      if (f.value > maxVal) maxVal = f.value;
    }
    expect(maxVal).toBeLessThanOrEqual(100.001);
    expect(evaluateSpring(heavy, 0, 100, 0, 4.0).done).toBe(true);
  });

  test("is frame-rate independent across 60Hz, 120Hz, and 240Hz", () => {
    const spring = { duration: 600, bounce: 0.25 };
    // Exact elapsed timestamp t = 0.25s produces the exact same frame regardless of refresh cadence.
    const at60 = evaluateSpring(spring, 0, 1, 0, 15 / 60);
    const at120 = evaluateSpring(spring, 0, 1, 0, 30 / 120);
    const at240 = evaluateSpring(spring, 0, 1, 0, 60 / 240);
    expect(at60.value).toBeCloseTo(at120.value, 10);
    expect(at120.value).toBeCloseTo(at240.value, 10);
    expect(at60.velocity).toBeCloseTo(at240.velocity, 10);
  });

  test("configured duration is the approximate settle time for both physical and CSS motion", () => {
    for (const config of [
      { duration: 480, bounce: 0 },
      { duration: 600, bounce: 0.25 },
      { duration: 680, bounce: 0.42 },
      { duration: 720, bounce: 0.08 },
    ]) {
      expect(Math.abs(resolveSpringDurationMs(config) - config.duration)).toBeLessThanOrEqual(8);
    }

    expect(ISLAND_MOTIONS.smooth.css?.duration).toBe("264ms");
    expect(ISLAND_MOTIONS.smooth.css?.vars?.["--island-expand-duration"]).toBe("304ms");
    expect(ISLAND_MOTIONS.smooth.css?.vars?.["--island-collapse-duration"]).toBe("232ms");
  });

  test("preserves instantaneous initial velocity across mid-flight interruptions", () => {
    const spring = { duration: 600, bounce: 0.25 };
    // Simulate expanding 0 -> 100, interrupted at t = 0.1s while moving fast forward.
    const mid = evaluateSpring(spring, 0, 100, 0, 0.1);
    expect(mid.velocity).toBeGreaterThan(200);
    // Reverse target back to 0 carrying `mid.velocity`. Momentum carries it forward slightly before reversing.
    const rightAfter = evaluateSpring(spring, mid.value, 0, mid.velocity, 0.016);
    expect(rightAfter.value).toBeGreaterThan(mid.value);
  });

  test("springToCssLinear emits valid linear() curves", () => {
    const bouncyCss = springToCssLinear({ duration: 600, bounce: 0.25 }, 24);
    const smoothCss = springToCssLinear({ duration: 480, bounce: 0 }, 24);
    expect(bouncyCss.startsWith("linear(0, ")).toBe(true);
    expect(bouncyCss.endsWith(", 1)")).toBe(true);
    const bouncyNums = bouncyCss
      .slice(7, -1)
      .split(",")
      .map((s) => Number(s.trim()));
    expect(Math.max(...bouncyNums)).toBeGreaterThan(1.01);

    const smoothNums = smoothCss
      .slice(7, -1)
      .split(",")
      .map((s) => Number(s.trim()));
    expect(Math.max(...smoothNums)).toBeLessThanOrEqual(1.0001);
  });
});

describe("pluggable motion adapters & presets", () => {
  test("includes all 6 predefined presets with distinct motion characteristics", () => {
    expect(Object.keys(ISLAND_MOTIONS).sort()).toEqual([
      "bouncy",
      "elastic",
      "gentle",
      "instant",
      "smooth",
      "snappy",
    ]);

    const bouncyPeak = Math.max(
      ...Array.from({ length: 100 }, (_, i) => ISLAND_MOTIONS.bouncy.sample!({ from: 0, to: 1, velocity: 0, channel: "expand", t: i * 0.01 }).value),
    );
    const elasticPeak = Math.max(
      ...Array.from({ length: 120 }, (_, i) => ISLAND_MOTIONS.elastic.sample!({ from: 0, to: 1, velocity: 0, channel: "expand", t: i * 0.01 }).value),
    );
    const smoothPeak = Math.max(
      ...Array.from({ length: 100 }, (_, i) => ISLAND_MOTIONS.smooth.sample!({ from: 0, to: 1, velocity: 0, channel: "expand", t: i * 0.01 }).value),
    );

    expect(elasticPeak).toBeGreaterThan(bouncyPeak);
    expect(bouncyPeak).toBeGreaterThan(smoothPeak);
    expect(smoothPeak).toBeLessThanOrEqual(1.0001);
    expect(ISLAND_MOTIONS.instant.reduced).toBe(true);
  });

  test("createEasingMotion, createCssMotion, and custom adapters plug in cleanly", () => {
    const easingAdapter = createEasingMotion({
      name: "expo",
      duration: 300,
      easing: easings.easeOutExpo,
    });
    const half = easingAdapter.sample!({ from: 0, to: 100, velocity: 0, channel: "morph", t: 0.15 });
    expect(half.value).toBeGreaterThan(90);
    expect(half.done).toBe(false);
    expect(easingAdapter.sample!({ from: 0, to: 100, velocity: 0, channel: "morph", t: 0.3 }).done).toBe(true);

    const cssAdapter = createCssMotion({
      name: "brand-css",
      duration: "320ms",
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      exitMs: 320,
    });
    let updated = 0;
    let completed = false;
    cssAdapter.animate({
      from: 0,
      to: 100,
      velocity: 0,
      channel: "morph",
      onUpdate: (v) => (updated = v),
      onComplete: () => (completed = true),
    });
    expect(updated).toBe(100);
    expect(completed).toBe(true);
    expect(cssAdapter.css?.vars?.["--island-duration"]).toBe("320ms");

    const customAdapter: IslandMotionAdapter = {
      name: "my-custom-adapter",
      animate({ to, onUpdate, onComplete }) {
        onUpdate(to, 0);
        onComplete?.();
        return { stop() {} };
      },
    };
    expect(resolveMotionAdapter(customAdapter, false)).toBe(customAdapter);
    expect(resolveMotionAdapter(customAdapter, true)).toBe(ISLAND_MOTIONS.instant);
    expect(resolveMotionAdapter("snappy")).toBe(ISLAND_MOTIONS.snappy);
    expect(resolveMotionAdapter(undefined)).toBe(ISLAND_MOTIONS.bouncy);
  });

  test("createSpringMotion completes cleanly when rAF is unavailable in Node/SSR", () => {
    expect(typeof globalThis.requestAnimationFrame).toBe("undefined");
    const adapter = createSpringMotion({ name: "ssr-test", default: { duration: 400, bounce: 0.2 } });
    let last = -1;
    let finished = false;
    adapter.animate({
      from: 0,
      to: 200,
      velocity: 0,
      channel: "morph",
      onUpdate: (v) => (last = v),
      onComplete: () => (finished = true),
    });
    expect(last).toBe(200);
    expect(finished).toBe(true);
  });
});
