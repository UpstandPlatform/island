import { readFile, writeFile } from "node:fs/promises";

import { defineConfig } from "tsup";

/** Entries that are React client modules get a "use client" directive (RSC). */
const CLIENT_ENTRIES = ["dist/index.js", "dist/sileo.js"];

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core/index.ts",
    motion: "src/core/motion.ts",
    sileo: "src/sileo.tsx",
  },
  format: ["esm"],
  // tsup injects baseUrl into the declaration build, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  target: "es2020",
  external: ["react", "react-dom", "react/jsx-runtime", "sileo"],
  async onSuccess() {
    for (const file of CLIENT_ENTRIES) {
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client"')) await writeFile(file, `"use client";\n${code}`);
    }
  },
});
