/**
 * @upstand/island/motion — framework-free, SSR-safe 120Hz+ motion engine,
 * analytical spring solver, easing curves, and pluggable motion adapters.
 *
 * All animations share a single `requestAnimationFrame` loop clocked via
 * `performance.now()` so animations run smoothly at the display's native refresh
 * rate (60Hz / 120Hz / 240Hz) and preserve instantaneous velocity across
 * mid-flight interruptions.
 */

export type IslandMotionChannel =
  | "morph"
  | "expand"
  | "collapse"
  | "enter"
  | "exit"
  | "dragReturn"
  | "header";

export interface IslandMotionFrame {
  value: number;
  velocity: number;
  done: boolean;
}

export interface IslandMotionRunOptions {
  from: number;
  to: number;
  velocity: number;
  channel: IslandMotionChannel;
  onUpdate: (value: number, velocity: number) => void;
  onComplete?: () => void;
}

export interface IslandMotionHandle {
  stop: () => void;
}

export interface IslandMotionCssConfig {
  duration: string;
  easing: string;
  exitMs?: number;
  vars?: Record<string, string>;
}

/**
 * Pluggable motion adapter interface. Implement this directly or construct one
 * via `createSpringMotion`, `createEasingMotion`, or `createCssMotion`.
 */
export interface IslandMotionAdapter {
  readonly name: string;
  readonly reduced?: boolean;
  animate: (options: IslandMotionRunOptions) => IslandMotionHandle;
  /** Optional deterministic frame sampler for testing and CSS curve generation. */
  sample?: (params: {
    from: number;
    to: number;
    velocity: number;
    channel: IslandMotionChannel;
    t: number;
  }) => IslandMotionFrame;
  css?: IslandMotionCssConfig;
}

export interface IslandSpringConfig {
  /** Perceptual spring duration in ms (used with `bounce`). */
  duration?: number;
  /** Bounce factor (`0` = critically damped, `0.25` = expressive, `-0.5` = overdamped). */
  bounce?: number;
  /** Explicit spring stiffness (overrides `duration`/`bounce` when set). */
  stiffness?: number;
  /** Explicit spring damping (overrides `duration`/`bounce` when set). */
  damping?: number;
  /** Spring mass. Default `1`. */
  mass?: number;
  /** Settling distance threshold. Default `0.001`. */
  precision?: number;
  /** Settling velocity threshold (units/s). Default `0.01`. */
  velocityThreshold?: number;
}

export type IslandMotionPreset = "bouncy" | "smooth" | "snappy" | "elastic" | "gentle" | "instant";

export type IslandMotionInput = IslandMotionPreset | IslandMotionAdapter;

export interface ResolvedSpringParams {
  stiffness: number;
  damping: number;
  mass: number;
  omega0: number;
  zeta: number;
  precision: number;
  velocityThreshold: number;
  nominalDurationMs: number;
}

const MAX_SPRING_SECONDS = 10;

/**
 * Resolve either `{ duration, bounce }` or `{ stiffness, damping, mass }` into
 * canonical physical spring constants.
 */
export function resolveSpringParams(config: IslandSpringConfig = {}): ResolvedSpringParams {
  const mass = Math.max(0.01, config.mass ?? 1);
  const precision = Math.max(1e-5, config.precision ?? 0.001);
  const velocityThreshold = Math.max(1e-4, config.velocityThreshold ?? 0.01);

  if (config.stiffness !== undefined || config.damping !== undefined) {
    const stiffness = Math.max(0.01, config.stiffness ?? 260);
    const damping = Math.max(0.01, config.damping ?? 24);
    const omega0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const nominalDurationMs = Math.max(50, Math.round(((2 * Math.PI) / omega0) * 1000));
    return { stiffness, damping, mass, omega0, zeta, precision, velocityThreshold, nominalDurationMs };
  }

  const nominalDurationMs = Math.max(10, config.duration ?? 500);
  const periodSec = nominalDurationMs / 1000;
  const bounce = Math.max(-0.99, Math.min(0.95, config.bounce ?? 0));
  const omega0 = (2 * Math.PI) / periodSec;
  const zeta = bounce >= 0 ? Math.max(0.05, 1 - bounce) : 1 / (1 + bounce);
  const stiffness = omega0 * omega0 * mass;
  const damping = 2 * zeta * omega0 * mass;

  return { stiffness, damping, mass, omega0, zeta, precision, velocityThreshold, nominalDurationMs };
}

/**
 * Exact closed-form analytical damped harmonic oscillator evaluation at `tSeconds`.
 * Frame-rate independent: identical at 60Hz, 120Hz, 144Hz, and 240Hz.
 */
export function evaluateSpring(
  config: IslandSpringConfig | ResolvedSpringParams,
  from: number,
  to: number,
  initialVelocity: number,
  tSeconds: number,
): IslandMotionFrame {
  const params = "omega0" in config ? config : resolveSpringParams(config);
  const { omega0, zeta, precision, velocityThreshold } = params;
  const y0 = from - to;
  const v0 = Number.isFinite(initialVelocity) ? initialVelocity : 0;
  const t = Math.max(0, tSeconds);

  if (Math.abs(y0) <= precision && Math.abs(v0) <= velocityThreshold) {
    return { value: to, velocity: 0, done: true };
  }
  if (t >= MAX_SPRING_SECONDS) {
    return { value: to, velocity: 0, done: true };
  }

  let y: number;
  let v: number;

  if (Math.abs(zeta - 1) <= 1e-6) {
    // Critically damped: y(t) = (A + B*t) * e^(-w0*t)
    const A = y0;
    const B = v0 + omega0 * y0;
    const env = Math.exp(-omega0 * t);
    y = (A + B * t) * env;
    v = (B - omega0 * (A + B * t)) * env;
  } else if (zeta < 1) {
    // Underdamped: oscillatory decay
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const A = y0;
    const B = (v0 + zeta * omega0 * y0) / omegaD;
    const env = Math.exp(-zeta * omega0 * t);
    const cos = Math.cos(omegaD * t);
    const sin = Math.sin(omegaD * t);
    y = env * (A * cos + B * sin);
    v = env * ((B * omegaD - A * zeta * omega0) * cos - (A * omegaD + B * zeta * omega0) * sin);
  } else {
    // Overdamped: two real negative roots
    const gamma = omega0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -omega0 * zeta + gamma;
    const r2 = -omega0 * zeta - gamma;
    const c1 = (v0 - r2 * y0) / (2 * gamma);
    const c2 = y0 - c1;
    const e1 = Math.exp(r1 * t);
    const e2 = Math.exp(r2 * t);
    y = c1 * e1 + c2 * e2;
    v = c1 * r1 * e1 + c2 * r2 * e2;
  }

  const done = t > 0 && Math.abs(y) <= precision && Math.abs(v) <= velocityThreshold;
  if (done) {
    return { value: to, velocity: 0, done: true };
  }
  return { value: to + y, velocity: v, done: false };
}

/** Estimate the true settling duration in ms for a normalized `0 -> 1` spring transition. */
export function resolveSpringDurationMs(config: IslandSpringConfig): number {
  const params = resolveSpringParams(config);
  const maxMs = Math.max(params.nominalDurationMs * 3.5, 2400);
  const stepMs = 8;
  for (let ms = stepMs; ms <= maxMs; ms += stepMs) {
    if (evaluateSpring(params, 0, 1, 0, ms / 1000).done) {
      return ms;
    }
  }
  return Math.round(maxMs);
}

/**
 * Sample a normalized spring curve into a CSS `linear(...)` easing string so
 * CSS transitions follow the same physical response and overshoot.
 */
export function springToCssLinear(config: IslandSpringConfig, samples = 36): string {
  const count = Math.max(8, samples);
  const params = resolveSpringParams(config);
  const totalSec = resolveSpringDurationMs(params) / 1000;
  const stops: string[] = ["0"];
  for (let i = 1; i < count; i++) {
    const t = (i / count) * totalSec;
    const frame = evaluateSpring(params, 0, 1, 0, t);
    stops.push(Number(frame.value.toFixed(4)).toString());
  }
  stops.push("1");
  return `linear(${stops.join(", ")})`;
}

type TickCallback = (nowMs: number) => boolean;

const activeTicks = new Set<TickCallback>();
let rafId: number | null = null;

function nowTimestamp(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function runTickLoop(timestamp: number) {
  rafId = null;
  for (const tick of [...activeTicks]) {
    let keep = false;
    try {
      keep = tick(timestamp);
    } catch {
      keep = false;
    }
    if (!keep) activeTicks.delete(tick);
  }
  if (activeTicks.size > 0 && typeof requestAnimationFrame === "function") {
    rafId = requestAnimationFrame(runTickLoop);
  }
}

/**
 * Subscribe a per-frame callback to the shared `requestAnimationFrame` loop.
 * Runs at native display refresh rate (60Hz / 120Hz / 240Hz) and shuts down
 * completely when no animations are active.
 */
export function scheduleMotionTick(callback: TickCallback): () => void {
  if (typeof requestAnimationFrame !== "function") {
    return () => {};
  }
  activeTicks.add(callback);
  if (rafId === null) {
    rafId = requestAnimationFrame(runTickLoop);
  }
  return () => {
    activeTicks.delete(callback);
    if (activeTicks.size === 0 && rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

/** Standard normalized easing curves for `createEasingMotion`. */
export const easings = {
  linear: (t: number) => t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutQuint: (t: number) => 1 - Math.pow(1 - t, 5),
} as const;

export interface SpringMotionOptions {
  name?: string;
  default?: IslandSpringConfig;
  channels?: Partial<Record<IslandMotionChannel, IslandSpringConfig>>;
  exitMs?: number;
}

/** Create a 120Hz analytical spring motion adapter with per-channel tuning. */
export function createSpringMotion(options: SpringMotionOptions = {}): IslandMotionAdapter {
  const name = options.name ?? "spring";
  const baseConfig: IslandSpringConfig = options.default ?? { duration: 550, bounce: 0.25 };
  const resolvedCache = new Map<IslandMotionChannel, ResolvedSpringParams>();

  const getParams = (channel: IslandMotionChannel): ResolvedSpringParams => {
    let cached = resolvedCache.get(channel);
    if (!cached) {
      cached = resolveSpringParams(options.channels?.[channel] ?? baseConfig);
      resolvedCache.set(channel, cached);
    }
    return cached;
  };

  const morphConfig = options.channels?.morph ?? baseConfig;
  const exitConfig = options.channels?.exit ?? options.channels?.collapse ?? baseConfig;
  const cssDurationMs = resolveSpringDurationMs(morphConfig);
  const exitMs = options.exitMs ?? resolveSpringDurationMs(exitConfig);
  const cssEasing = springToCssLinear(morphConfig);

  const sample: NonNullable<IslandMotionAdapter["sample"]> = ({ from, to, velocity, channel, t }) => {
    const params = getParams(channel);
    // Scale threshold cleanly for large pixel ranges vs unit 0..1 ranges.
    const span = Math.abs(to - from);
    const scaledPrecision = span > 10 ? Math.max(params.precision, 0.01) : params.precision;
    const scaledVelocity = span > 10 ? Math.max(params.velocityThreshold, 0.05) : params.velocityThreshold;
    return evaluateSpring(
      { ...params, precision: scaledPrecision, velocityThreshold: scaledVelocity },
      from,
      to,
      velocity,
      t,
    );
  };

  return {
    name,
    sample,
    css: {
      duration: `${cssDurationMs}ms`,
      easing: cssEasing,
      exitMs,
      vars: {
        "--island-duration": `${cssDurationMs}ms`,
        "--island-ease": cssEasing,
      },
    },
    animate({ from, to, velocity, channel, onUpdate, onComplete }) {
      const initialCheck = sample({ from, to, velocity, channel, t: 0 });
      if (initialCheck.done || typeof requestAnimationFrame !== "function") {
        onUpdate(to, 0);
        onComplete?.();
        return { stop() {} };
      }

      const startMs = nowTimestamp();
      let stopped = false;
      const cancel = scheduleMotionTick((nowMs) => {
        if (stopped) return false;
        const elapsedSec = Math.max(0, (nowMs - startMs) / 1000);
        const frame = sample({ from, to, velocity, channel, t: elapsedSec });
        onUpdate(frame.value, frame.velocity);
        if (frame.done) {
          stopped = true;
          onComplete?.();
          return false;
        }
        return true;
      });

      return {
        stop() {
          if (stopped) return;
          stopped = true;
          cancel();
        },
      };
    },
  };
}

export interface EasingMotionChannelConfig {
  duration: number;
  easing?: (t: number) => number;
}

export interface EasingMotionOptions {
  name?: string;
  duration?: number;
  easing?: (t: number) => number;
  channels?: Partial<Record<IslandMotionChannel, EasingMotionChannelConfig>>;
  cssEasing?: string;
  exitMs?: number;
}

/** Create a 120Hz normalized curve-based motion adapter with custom JS easing curves. */
export function createEasingMotion(options: EasingMotionOptions = {}): IslandMotionAdapter {
  const name = options.name ?? "easing";
  const baseDuration = Math.max(0, options.duration ?? 420);
  const baseEasing = options.easing ?? easings.easeOutCubic;
  const cssEasing = options.cssEasing ?? "cubic-bezier(0.22, 1, 0.36, 1)";
  const exitMs = options.exitMs ?? options.channels?.exit?.duration ?? baseDuration;

  const sample: NonNullable<IslandMotionAdapter["sample"]> = ({ from, to, channel, t }) => {
    const ch = options.channels?.[channel];
    const durSec = Math.max(0, (ch?.duration ?? baseDuration) / 1000);
    const fn = ch?.easing ?? baseEasing;
    if (durSec <= 0 || t >= durSec) {
      return { value: to, velocity: 0, done: true };
    }
    const clampedT = Math.max(0, t);
    const progress = clampedT / durSec;
    const eased = fn(progress);
    const dt = 0.001;
    const nextProgress = Math.min(1, (clampedT + dt) / durSec);
    const vel = ((fn(nextProgress) - eased) * (to - from)) / dt;
    return {
      value: from + (to - from) * eased,
      velocity: Number.isFinite(vel) ? vel : 0,
      done: false,
    };
  };

  return {
    name,
    sample,
    css: {
      duration: `${baseDuration}ms`,
      easing: cssEasing,
      exitMs,
      vars: {
        "--island-duration": `${baseDuration}ms`,
        "--island-ease": cssEasing,
      },
    },
    animate({ from, to, velocity, channel, onUpdate, onComplete }) {
      const ch = options.channels?.[channel];
      const durMs = Math.max(0, ch?.duration ?? baseDuration);
      if (durMs <= 0 || from === to || typeof requestAnimationFrame !== "function") {
        onUpdate(to, 0);
        onComplete?.();
        return { stop() {} };
      }

      const startMs = nowTimestamp();
      let stopped = false;
      const cancel = scheduleMotionTick((nowMs) => {
        if (stopped) return false;
        const elapsedSec = Math.max(0, (nowMs - startMs) / 1000);
        const frame = sample({ from, to, velocity, channel, t: elapsedSec });
        onUpdate(frame.value, frame.velocity);
        if (frame.done) {
          stopped = true;
          onComplete?.();
          return false;
        }
        return true;
      });

      return {
        stop() {
          if (stopped) return;
          stopped = true;
          cancel();
        },
      };
    },
  };
}

export interface CssMotionOptions {
  name?: string;
  duration: string;
  easing: string;
  exitMs?: number;
  vars?: Record<string, string>;
}

/**
 * Lightweight CSS-driven motion adapter. Snaps JS geometry to targets while
 * feeding custom `--island-duration`, `--island-ease`, and CSS vars to stylesheets.
 */
export function createCssMotion(options: CssMotionOptions): IslandMotionAdapter {
  return {
    name: options.name ?? "css",
    css: {
      duration: options.duration,
      easing: options.easing,
      exitMs: options.exitMs ?? 420,
      vars: {
        "--island-duration": options.duration,
        "--island-ease": options.easing,
        ...options.vars,
      },
    },
    animate({ to, onUpdate, onComplete }) {
      onUpdate(to, 0);
      onComplete?.();
      return { stop() {} };
    },
  };
}

const instantAdapter: IslandMotionAdapter = {
  name: "instant",
  reduced: true,
  sample: ({ to }) => ({ value: to, velocity: 0, done: true }),
  css: {
    duration: "0ms",
    easing: "linear",
    exitMs: 0,
    vars: {
      "--island-duration": "0ms",
      "--island-ease": "linear",
    },
  },
  animate({ to, onUpdate, onComplete }) {
    onUpdate(to, 0);
    onComplete?.();
    return { stop() {} };
  },
};

/** Built-in predefined motion adapters ready for pluggable use or extension. */
export const ISLAND_MOTIONS: Readonly<Record<IslandMotionPreset, IslandMotionAdapter>> = {
  bouncy: /* @__PURE__ */ createSpringMotion({
    name: "bouncy",
    default: { duration: 600, bounce: 0.25 },
    channels: {
      morph: { duration: 600, bounce: 0.25 },
      expand: { duration: 600, bounce: 0.25 },
      collapse: { duration: 500, bounce: 0 },
      enter: { duration: 420, bounce: 0.28 },
      exit: { duration: 420, bounce: 0 },
      dragReturn: { duration: 320, bounce: 0.22 },
      header: { duration: 420, bounce: 0.1 },
    },
    exitMs: 480,
  }),
  smooth: /* @__PURE__ */ createSpringMotion({
    name: "smooth",
    default: { duration: 480, bounce: 0 },
    channels: {
      morph: { duration: 480, bounce: 0 },
      expand: { duration: 480, bounce: 0 },
      collapse: { duration: 380, bounce: 0 },
      enter: { duration: 380, bounce: 0 },
      exit: { duration: 360, bounce: 0 },
      dragReturn: { duration: 300, bounce: 0 },
      header: { duration: 360, bounce: 0 },
    },
    exitMs: 380,
  }),
  snappy: /* @__PURE__ */ createSpringMotion({
    name: "snappy",
    default: { duration: 360, bounce: 0.18 },
    channels: {
      morph: { duration: 360, bounce: 0.18 },
      expand: { duration: 360, bounce: 0.18 },
      collapse: { duration: 280, bounce: 0 },
      enter: { duration: 300, bounce: 0.2 },
      exit: { duration: 280, bounce: 0 },
      dragReturn: { duration: 240, bounce: 0.15 },
      header: { duration: 280, bounce: 0.08 },
    },
    exitMs: 300,
  }),
  elastic: /* @__PURE__ */ createSpringMotion({
    name: "elastic",
    default: { duration: 680, bounce: 0.42 },
    channels: {
      morph: { duration: 680, bounce: 0.42 },
      expand: { duration: 680, bounce: 0.42 },
      collapse: { duration: 440, bounce: 0.08 },
      enter: { duration: 520, bounce: 0.38 },
      exit: { duration: 420, bounce: 0 },
      dragReturn: { duration: 380, bounce: 0.35 },
      header: { duration: 460, bounce: 0.18 },
    },
    exitMs: 460,
  }),
  gentle: /* @__PURE__ */ createSpringMotion({
    name: "gentle",
    default: { duration: 720, bounce: 0.08 },
    channels: {
      morph: { duration: 720, bounce: 0.08 },
      expand: { duration: 720, bounce: 0.08 },
      collapse: { duration: 580, bounce: 0 },
      enter: { duration: 560, bounce: 0.06 },
      exit: { duration: 520, bounce: 0 },
      dragReturn: { duration: 420, bounce: 0.05 },
      header: { duration: 500, bounce: 0 },
    },
    exitMs: 560,
  }),
  instant: instantAdapter,
};

/** Resolve a motion preset name or custom adapter, honoring `prefers-reduced-motion`. */
export function resolveMotionAdapter(
  input?: IslandMotionInput,
  reducedMotion = false,
): IslandMotionAdapter {
  if (reducedMotion) return ISLAND_MOTIONS.instant;
  if (!input) return ISLAND_MOTIONS.bouncy;
  if (typeof input === "string") return ISLAND_MOTIONS[input] ?? ISLAND_MOTIONS.bouncy;
  return input;
}
