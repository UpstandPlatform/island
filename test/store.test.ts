import { describe, expect, test } from "bun:test";

import { createIslandApi, createIslandStore, EMPTY_ISLAND_STATE, type IslandHaptic, type IslandStoreOptions } from "../src/core";

/** Manual clock + timers so auto-dismiss is deterministic. */
function fakeTime() {
  let time = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    timers: {
      set: (fn: () => void, ms: number) => {
        const id = ++seq;
        pending.set(id, { at: time + ms, fn });
        return id;
      },
      clear: (id: unknown) => {
        pending.delete(id as number);
      },
    },
    advance(ms: number) {
      time += ms;
      for (const [id, entry] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (entry.at <= time && pending.has(id)) {
          pending.delete(id);
          entry.fn();
        }
      }
    },
  };
}

function setup(options: IslandStoreOptions = {}) {
  const clock = fakeTime();
  const store = createIslandStore({ now: clock.now, timers: clock.timers, ...options });
  const api = createIslandApi(() => store);
  return { store, api, clock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("busy", () => {
  test("is ref-counted and idempotent", () => {
    const { store } = setup();
    const a = store.busy("A");
    const b = store.busy("B");
    expect(store.getSnapshot()).toMatchObject({ busy: true, busyCount: 2 });
    a();
    a();
    expect(store.getSnapshot()).toMatchObject({ busy: true, busyCount: 1 });
    b();
    expect(store.getSnapshot()).toMatchObject({ busy: false, busyCount: 0, busyLabel: null });
  });

  test("newest label wins, and the previous one returns when it ends", () => {
    const { store } = setup();
    const first = store.busy("Loading older activity");
    const second = store.busy("Creating");
    expect(store.getSnapshot().busyLabel).toBe("Creating");
    second();
    expect(store.getSnapshot().busyLabel).toBe("Loading older activity");
    first();
  });

  test("unlabelled work keeps the newest labelled one", () => {
    const { store } = setup();
    const labelled = store.busy("Reading your request");
    const silent = store.busy();
    expect(store.getSnapshot()).toMatchObject({ busy: true, busyLabel: "Reading your request" });
    labelled();
    expect(store.getSnapshot()).toMatchObject({ busy: true, busyLabel: null });
    silent();
  });

  test("emits busy events", () => {
    const { store } = setup();
    const seen: boolean[] = [];
    store.on("busy", (state) => seen.push(state.busy));
    store.busy("x")();
    expect(seen).toEqual([true, false]);
  });
});

describe("toasts", () => {
  test("show, auto-dismiss on the type's duration", () => {
    const { api, store, clock } = setup();
    const id = api.toast.success("Saved", { description: "All good" });
    expect(store.getSnapshot().toast).toMatchObject({ id, type: "success", title: "Saved", description: "All good", duration: 6000 });
    clock.advance(5999);
    expect(store.getSnapshot().toast).not.toBeNull();
    clock.advance(1);
    expect(store.getSnapshot().toast).toBeNull();
  });

  test("loading toasts are sticky; custom durations apply", () => {
    const { api, store, clock } = setup({ durations: { info: 1000 } });
    api.toast.loading("Working");
    clock.advance(60_000);
    expect(store.getSnapshot().toast?.type).toBe("loading");
    api.toast.dismiss();
    api.toast.info("Hi");
    clock.advance(1000);
    expect(store.getSnapshot().toast).toBeNull();
  });

  test("replace strategy morphs the visible toast and reports the old one as replaced", () => {
    const { api, store } = setup();
    const reasons: string[] = [];
    store.on("dismiss", (_t, reason) => reasons.push(reason));
    api.toast.info("one");
    const two = api.toast.error("two");
    expect(store.getSnapshot().toast?.id).toBe(two);
    expect(store.getSnapshot().queue).toHaveLength(0);
    expect(reasons).toEqual(["replaced"]);
  });

  test("queue strategy waits its turn and caps the queue", () => {
    const { api, store, clock } = setup({ strategy: "queue", maxQueue: 2, durations: { info: 100 } });
    const dropped: string[] = [];
    store.on("dismiss", (toast, reason) => reason === "overflow" && dropped.push(toast.title ?? ""));
    api.toast.info("a");
    api.toast.info("b");
    api.toast.info("c");
    api.toast.info("d");
    expect(store.getSnapshot().toast?.title).toBe("a");
    expect(store.getSnapshot().queue.map((t) => t.title)).toEqual(["c", "d"]);
    expect(dropped).toEqual(["b"]);
    clock.advance(100);
    expect(store.getSnapshot().toast?.title).toBe("c");
    clock.advance(100);
    expect(store.getSnapshot().toast?.title).toBe("d");
    clock.advance(100);
    expect(store.getSnapshot().toast).toBeNull();
  });

  test("same id updates in place and bumps version", () => {
    const { api, store } = setup();
    api.toast.info("Uploading", { id: "up" });
    api.toast.success("Uploaded", { id: "up" });
    const toast = store.getSnapshot().toast;
    expect(toast).toMatchObject({ id: "up", type: "success", title: "Uploaded", version: 1 });
  });

  test("update and dismiss of unknown ids are no-ops", () => {
    const { api, store } = setup();
    expect(api.toast.update("nope", { title: "x" })).toBe(false);
    api.toast.dismiss("nope");
    expect(store.getSnapshot()).toBe(EMPTY_ISLAND_STATE);
  });

  test("pause and resume keep the remaining time", () => {
    const { api, store, clock } = setup({ durations: { info: 1000 } });
    api.toast.info("Hover me");
    clock.advance(400);
    store.pause();
    clock.advance(10_000);
    expect(store.getSnapshot().toast).not.toBeNull();
    store.resume();
    clock.advance(599);
    expect(store.getSnapshot().toast).not.toBeNull();
    clock.advance(1);
    expect(store.getSnapshot().toast).toBeNull();
  });

  test("action and custom toasts carry their payloads", () => {
    const { api, store } = setup();
    const onClick = () => {};
    api.toast.action("Something went wrong", { description: "Offline", action: { label: "Retry", onClick } });
    expect(store.getSnapshot().toast).toMatchObject({ type: "action", action: { label: "Retry" } });
    api.toast.custom({ any: "node" }, { duration: null });
    expect(store.getSnapshot().toast).toMatchObject({ type: "custom", content: { any: "node" }, duration: null });
  });

  test("onDismiss runs once with the reason", () => {
    const { api } = setup();
    const reasons: string[] = [];
    const id = api.toast.info("x", { onDismiss: (_t, reason) => reasons.push(reason) });
    api.toast.dismiss(id);
    api.toast.dismiss(id);
    expect(reasons).toEqual(["api"]);
  });

  test("haptics follow the toast type", () => {
    const seen: IslandHaptic[] = [];
    const { api, store } = setup({ onHaptic: (kind) => seen.push(kind) });
    api.toast.info("quiet");
    api.toast.success("yay");
    api.toast.error("nope");
    store.haptic("light");
    expect(seen).toEqual(["success", "error", "light"]);
  });

  test("dismiss while paused resets paused state so next and queued toasts auto-dismiss", () => {
    const { api, store, clock } = setup({ strategy: "queue", durations: { info: 500 } });
    const first = api.toast.info("first");
    api.toast.info("second");
    clock.advance(200);
    store.pause();
    store.dismiss(first, "user");
    expect(store.getSnapshot().toast?.title).toBe("second");
    clock.advance(500);
    expect(store.getSnapshot().toast).toBeNull();

    const third = api.toast.info("third");
    store.pause();
    store.dismiss(third, "swipe");
    api.toast.info("fourth");
    clock.advance(500);
    expect(store.getSnapshot().toast).toBeNull();
  });
});

describe("promise toasts", () => {
  test("loading then success with the value", async () => {
    const { api, store } = setup();
    const result = api.toast.promise(Promise.resolve(42), {
      id: "p",
      loading: "Saving",
      success: (n) => ({ title: `Saved ${n}` }),
      error: "Failed",
    });
    expect(store.getSnapshot().toast).toMatchObject({ id: "p", type: "loading", title: "Saving", duration: null });
    expect(await result).toBe(42);
    await flush();
    expect(store.getSnapshot().toast).toMatchObject({ id: "p", type: "success", title: "Saved 42", duration: 6000 });
  });

  test("loading then error, original rejection is passed through", async () => {
    const { api, store } = setup();
    const failing = Promise.reject(new Error("boom"));
    const result = api.toast.promise(failing, { loading: "Saving", success: "ok", error: (e) => (e as Error).message });
    await expect(result).rejects.toThrow("boom");
    await flush();
    expect(store.getSnapshot().toast).toMatchObject({ type: "error", title: "boom" });
  });

  test("a result still shows when the loading toast was replaced, but not after a dismiss", async () => {
    const { api, store } = setup();
    let resolve!: (v: string) => void;
    api.toast.promise(new Promise<string>((r) => (resolve = r)), { id: "p", loading: "Saving", success: "Saved", error: "Failed" });
    api.toast.info("Something else");
    resolve("ok");
    await flush();
    expect(store.getSnapshot().toast).toMatchObject({ id: "p", title: "Saved" });

    let resolve2!: (v: string) => void;
    api.toast.promise(new Promise<string>((r) => (resolve2 = r)), { id: "q", loading: "Saving", success: "Saved", error: "Failed" });
    api.toast.dismiss("q");
    resolve2("ok");
    await flush();
    expect(store.getSnapshot().toast).toBeNull();
  });

  test("settles to error when factory throws synchronously", async () => {
    const { api, store } = setup();
    const result = api.toast.promise(
      () => {
        throw new Error("sync boom");
      },
      { loading: "Saving", success: "Saved", error: (e) => (e as Error).message },
    );
    await expect(result).rejects.toThrow("sync boom");
    await flush();
    expect(store.getSnapshot().toast).toMatchObject({ type: "error", title: "sync boom", duration: 6000 });
  });

  test("clears stale loading description when settled message omits it", async () => {
    const { api, store } = setup();
    const result = api.toast.promise(Promise.resolve("done"), {
      loading: { title: "Uploading", description: "50% complete" },
      success: "Uploaded",
      error: "Failed",
    });
    expect(store.getSnapshot().toast?.description).toBe("50% complete");
    await result;
    await flush();
    expect(store.getSnapshot().toast).toMatchObject({ type: "success", title: "Uploaded" });
    expect(store.getSnapshot().toast?.description).toBeUndefined();
  });
});

describe("slots", () => {
  test("newest registration wins and earlier ones return on release", () => {
    const { store } = setup();
    const page = store.setSlot("title", "Inbox");
    const sheet = store.setSlot("title", "Chat");
    expect(store.getSnapshot().slots.title).toBe("Chat");
    sheet.release();
    expect(store.getSnapshot().slots.title).toBe("Inbox");
    page.update("Inbox (2)");
    expect(store.getSnapshot().slots.title).toBe("Inbox (2)");
    page.release();
    expect("title" in store.getSnapshot().slots).toBe(false);
  });

  test("updates keep stacking order", () => {
    const { store } = setup();
    const a = store.setSlot("badge", "A");
    const b = store.setSlot("badge", "B");
    a.update("A2");
    expect(store.getSnapshot().slots.badge).toBe("B");
    b.release();
    expect(store.getSnapshot().slots.badge).toBe("A2");
  });
});

describe("layout & per-toast customization", () => {
  test("updates position, mode, surface, dir, and theme via store & imperative API", () => {
    const { store, api } = setup();
    const layoutEvents: unknown[] = [];
    store.on("layout", (l) => layoutEvents.push(l));

    expect(store.getSnapshot()).toMatchObject({
      position: "top-center",
      mode: "floating",
      surface: "solid",
      dir: "auto",
      theme: "dark",
    });

    api.setPosition("bottom-right");
    api.setMode("dock");
    api.setSurface("liquid-glass");
    api.setDir("rtl");
    api.setTheme("light");

    expect(store.getSnapshot()).toMatchObject({
      position: "bottom-right",
      mode: "dock",
      surface: "liquid-glass",
      dir: "rtl",
      theme: "light",
    });
    expect(layoutEvents).toHaveLength(5);

    // Setting the exact same value is a no-op.
    api.setPosition("bottom-right");
    expect(layoutEvents).toHaveLength(5);
  });

  test("per-toast position, surface, roundness, autopilot, and fill are preserved", () => {
    const { api, store } = setup();
    api.toast.info("Glass", {
      position: "top-left",
      surface: "liquid-glass",
      roundness: 20,
      autopilot: { expand: 100, collapse: 2500 },
      fill: "#111118",
      glass: { blur: 14, refraction: 1.3 },
    });
    expect(store.getSnapshot().toast).toMatchObject({
      position: "top-left",
      surface: "liquid-glass",
      roundness: 20,
      autopilot: { expand: 100, collapse: 2500 },
      fill: "#111118",
      glass: { blur: 14, refraction: 1.3 },
    });
  });

  test("custom store initial layout is reflected in frozen server snapshot", () => {
    const store = createIslandStore({ position: "bottom-left", mode: "dock", surface: "liquid-glass", dir: "rtl", theme: "light" });
    const srv = store.getServerSnapshot();
    expect(Object.isFrozen(srv)).toBe(true);
    expect(srv).toMatchObject({
      position: "bottom-left",
      mode: "dock",
      surface: "liquid-glass",
      dir: "rtl",
      theme: "light",
    });
    expect(store.hasLayoutOverride("position")).toBe(true);
    expect(store.hasLayoutOverride("mode")).toBe(true);
  });
});

describe("SSR", () => {
  test("server snapshot stays empty and stable whatever the client state", () => {
    const { store, api } = setup();
    const before = store.getServerSnapshot();
    store.busy("x");
    api.toast.loading("y");
    store.setSlot("title", "z");
    api.setPosition("bottom-center");
    expect(store.getServerSnapshot()).toBe(before);
    expect(before).toEqual({
      busy: false,
      busyCount: 0,
      busyLabel: null,
      toast: null,
      queue: [],
      slots: {},
      position: "top-center",
      mode: "floating",
      surface: "solid",
      dir: "auto",
      theme: "dark",
    });
    expect(Object.isFrozen(before)).toBe(true);
  });

  test("snapshots are referentially stable between changes", () => {
    const { store } = setup();
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a);
    store.busy()();
    expect(store.getSnapshot()).not.toBe(a);
  });

  test("importing the package touches no browser globals", async () => {
    const g = globalThis as Record<string, unknown>;
    expect(g.window).toBeUndefined();
    const mod = await import("../src/core");
    expect(typeof mod.islandCore.toast.success).toBe("function");
  });
});
