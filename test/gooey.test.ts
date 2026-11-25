import { describe, expect, test } from "bun:test";

import { buildGooeyPath, computePillX } from "../src/core/gooey";

function assertValidPath(d: string) {
  expect(d.length).toBeGreaterThan(10);
  expect(d).not.toContain("NaN");
  expect(d).not.toContain("Infinity");
  expect(d.startsWith("M ")).toBe(true);
  expect(d.endsWith(" Z")).toBe(true);
}

describe("gooey path geometry", () => {
  test("computes pill horizontal alignment for left, center, and right", () => {
    expect(computePillX(352, 160, "left")).toBe(0);
    expect(computePillX(352, 160, "center")).toBe(96);
    expect(computePillX(352, 160, "right")).toBe(192);
    expect(computePillX(100, 150, "right")).toBe(0);
  });

  test("builds pure pill path when collapsed and full C1 curve path when expanded", () => {
    const collapsed = buildGooeyPath({
      width: 352,
      pillHeight: 40,
      pillX: 96,
      pillWidth: 160,
      bodyHeight: 0,
      roundness: 16,
      expandDownward: true,
    });
    assertValidPath(collapsed);
    expect(collapsed).not.toContain(" C ");

    const midMorph = buildGooeyPath({
      width: 352,
      pillHeight: 40,
      pillX: 96,
      pillWidth: 160,
      bodyHeight: 24,
      roundness: 16,
      expandDownward: true,
    });
    assertValidPath(midMorph);
    expect(midMorph).toContain(" C ");

    const expanded = buildGooeyPath({
      width: 352,
      pillHeight: 40,
      pillX: 96,
      pillWidth: 160,
      bodyHeight: 96,
      roundness: 16,
      expandDownward: true,
    });
    assertValidPath(expanded);
    expect(expanded).toContain(" C ");
  });

  test("supports left, center, and right pill alignments, upward expansion, and dock mode", () => {
    for (const expandDownward of [true, false]) {
      for (const pillX of [0, 96, 192]) {
        for (const dockedEdge of [null, "top", "bottom"] as const) {
          const d = buildGooeyPath({
            width: 352,
            pillHeight: 40,
            pillX,
            pillWidth: 160,
            bodyHeight: 80,
            roundness: 16,
            expandDownward,
            dockedEdge,
          });
          assertValidPath(d);
        }
      }
    }
  });

  test("handles extreme roundness, tiny dimensions, and zero roundness cleanly", () => {
    for (const roundness of [0, 8, 999]) {
      const d = buildGooeyPath({
        width: 352,
        pillHeight: 40,
        pillX: 0,
        pillWidth: 40,
        bodyHeight: 80,
        roundness,
      });
      assertValidPath(d);
    }

    const tiny = buildGooeyPath({
      width: 20,
      pillHeight: 40,
      pillX: -5,
      pillWidth: 120,
      bodyHeight: -10,
      roundness: 16,
    });
    assertValidPath(tiny);
  });
});
