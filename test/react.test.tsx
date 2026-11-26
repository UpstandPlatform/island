import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createCssMotion,
  createIslandStore,
  DefaultIslandToastEngine,
  ISLAND_POSITIONS,
  ISLAND_MOTIONS,
  Island,
  IslandDock,
  IslandDockDivider,
  IslandDockItem,
  IslandProvider,
  IslandToaster,
  IslandViewport,
} from "../src";

describe("React SSR rendering", () => {
  test("renders all 6 positions, dock mode, liquid glass, RTL, and themes cleanly", () => {
    for (const position of ISLAND_POSITIONS) {
      const store = createIslandStore({
        position,
        mode: "dock",
        surface: "liquid-glass",
        dir: "rtl",
        theme: "light",
      });
      const html = renderToStaticMarkup(
        <IslandProvider store={store} motion={createCssMotion({ name: "custom-motion", duration: "300ms", easing: "ease" })}>
          <IslandViewport>
            <Island title="Inbox" />
          </IslandViewport>
          <IslandToaster />
        </IslandProvider>,
      );

      expect(html).toContain(`data-position="${position}"`);
      expect(html).toContain('data-mode="dock"');
      expect(html).toContain('data-surface="liquid-glass"');
      expect(html).toContain('data-dir="rtl"');
      expect(html).toContain('dir="rtl"');
      expect(html).toContain('data-island-theme="light"');
      expect(html).toContain('data-motion="custom-motion"');
      expect(html).toContain("data-island-glass-backdrop");
    }
  });

  test("renders composable IslandDock primitives with items, active dot, badges, and dividers", () => {
    const store = createIslandStore();
    const html = renderToStaticMarkup(
      <IslandProvider store={store}>
        <Island mode="dock" position="bottom-center">
          <IslandDock aria-label="Workspace navigation">
            <IslandDockItem icon={<span>H</span>} label="Home" active />
            <IslandDockDivider />
            <IslandDockItem icon={<span>M</span>} label="Messages" showLabel badge={3} />
          </IslandDock>
        </Island>
      </IslandProvider>,
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('data-island-dock=""');
    expect(html).toContain('data-island-dock-item=""');
    expect(html).toContain('data-active=""');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-island-dock-dot=""');
    expect(html).toContain('data-island-dock-badge=""');
    expect(html).toContain('role="separator"');
  });

  test("preserves ancestor data-island-theme when theme is not overridden on provider/store", () => {
    const store = createIslandStore();
    const html = renderToStaticMarkup(
      <div data-island-theme="light">
        <IslandProvider store={store}>
          <Island title="Inbox" />
        </IslandProvider>
      </div>,
    );
    expect(html).toContain('<div data-island-theme="light"><div data-island-anchor=""');
    expect(html).toContain('<div data-island=""');
    expect(html).not.toContain('data-island="" data-position="top-center" data-mode="floating" data-surface="solid" data-motion="bouncy" data-auto-morph="" data-dir="ltr" dir="ltr" data-island-theme=');
  });

  test("renders directional expansion anchor wrappers for top and bottom positions", () => {
    const store = createIslandStore();
    const topHtml = renderToStaticMarkup(
      <IslandProvider store={store}>
        <Island position="top-center" open expanded={<div>Details</div>} title="Inbox" />
      </IslandProvider>,
    );
    const bottomHtml = renderToStaticMarkup(
      <IslandProvider store={store}>
        <Island position="bottom-center" open expanded={<div>Details</div>} title="Inbox" />
      </IslandProvider>,
    );

    expect(topHtml).toContain('data-island-anchor="" data-position="top-center" data-mode="floating" data-open=""');
    expect(bottomHtml).toContain('data-island-anchor="" data-position="bottom-center" data-mode="floating" data-open=""');
  });

  test("renders IslandToaster SSR live regions and DefaultIslandToastEngine gooey markup", () => {
    const store = createIslandStore({ position: "top-right" });
    store.show({
      type: "success",
      title: "Saved",
      description: "Live everywhere",
      surface: "solid",
      styles: { root: "custom-root", title: "custom-title" },
    });

    // Server snapshot intentionally keeps active toasts client-only; IslandToaster renders live regions cleanly.
    const toasterHtml = renderToStaticMarkup(
      <IslandProvider store={store}>
        <IslandToaster closeLabel="Close" />
      </IslandProvider>,
    );
    expect(toasterHtml).toContain('aria-live="polite"');
    expect(toasterHtml).toContain('aria-live="assertive"');

    // Direct engine render verifies analytic gooey SVG path, liquid glass, RTL, and custom styles.
    const toast = store.getSnapshot().toast!;
    const engineHtml = renderToStaticMarkup(
      <DefaultIslandToastEngine
        toast={toast}
        store={store}
        position="top-right"
        mode="floating"
        surface="solid"
        motion={ISLAND_MOTIONS.bouncy}
        dir="rtl"
        theme="dark"
        roundness={16}
        inset="8px"
        insetX="12px"
        autopilot={true}
        swipeToDismiss={true}
        closeLabel="Close"
        styles={toast.styles}
      />,
    );

    expect(engineHtml).toContain("data-island-toast");
    expect(engineHtml).toContain("data-island-toast-surface");
    expect(engineHtml).toContain('dir="rtl"');
    expect(engineHtml).toContain("Saved");
    expect(engineHtml).toContain("Live everywhere");
    expect(engineHtml).toContain("custom-root");
    expect(engineHtml).toContain("custom-title");
    expect(engineHtml).toContain('aria-label="Close"');
    expect(engineHtml).toContain('data-island-toast-title=""');
    expect(engineHtml).toContain('aria-expanded="false"');
    expect(engineHtml).toContain('inert=""');
    const bodyId = engineHtml.match(/aria-controls="([^"]+)"/)?.[1];
    expect(bodyId).toBeTruthy();
    expect(engineHtml).toContain(`id="${bodyId}"`);
    // Geometry probe resolves --island-height / --island-toast-max-width for the JS silhouette.
    expect(engineHtml).toContain('data-island-toast-probe=""');
  });

  test("island.css keeps toast and island tokens in parity across themes", async () => {
    const css = await Bun.file(new URL("../src/island.css", import.meta.url)).text();
    // Explicit dark must win under a light ancestor, and system follows a dark OS.
    expect(css).toContain(':where([data-island-theme="dark"])');
    expect(css).toMatch(/prefers-color-scheme: dark\)\s*\{\s*:where\(\[data-island-theme="system"\]\)/);
    // Toast title uses the island title size.
    expect(css).not.toContain("font-size: 0.85rem");
    expect(css).toContain("[data-island-toast-probe]");
  });

  test("wraps leading, badge (including 0), and trailing slots cleanly and omits falsy/boolean slots", () => {
    const store = createIslandStore();
    const withSlots = renderToStaticMarkup(
      <IslandProvider store={store}>
        <Island leading={<span data-test="l">L</span>} badge={0} trailing={<span data-test="t">T</span>} title="Inbox" />
      </IslandProvider>,
    );
    expect(withSlots).toContain('data-island-leading=""');
    expect(withSlots).toContain('data-island-badge=""');
    expect(withSlots).toContain('data-island-trailing=""');

    const withoutSlots = renderToStaticMarkup(
      <IslandProvider store={store}>
        <Island leading={null} badge={false} trailing={undefined} title="Inbox" />
      </IslandProvider>,
    );
    expect(withoutSlots).not.toContain("data-island-leading");
    expect(withoutSlots).not.toContain("data-island-badge");
    expect(withoutSlots).not.toContain("data-island-trailing");
  });

  test("renders DefaultIslandToastEngine cleanly with null toast before opening", () => {
    const store = createIslandStore();
    const emptyHtml = renderToStaticMarkup(
      <DefaultIslandToastEngine
        toast={null}
        store={store}
        position="top-center"
        mode="floating"
        surface="solid"
        motion={ISLAND_MOTIONS.bouncy}
        dir="ltr"
        theme="dark"
        roundness={16}
        inset="8px"
        insetX="12px"
        autopilot={true}
        swipeToDismiss={true}
      />,
    );
    expect(emptyHtml).toBe("");
  });
});
