import { defineConfig } from "vite"

export default defineConfig({
  root: ".",
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
  },
  server: {
    fs: {
      allow: ["."],
    },
  },
  test: {
    environment: "jsdom",
    exclude: [".worktrees/**", "scraper/dist/**", "scraper/node_modules/**", "voting/dist/**", "voting/node_modules/**", "node_modules/**"],
    environmentMatchGlobs: [
      ["scraper/src/**", "node"],
      ["voting/src/**", "node"],
    ],
  },
})
