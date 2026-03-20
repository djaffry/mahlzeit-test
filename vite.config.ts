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
    exclude: [".worktrees/**", "scraper/**", "node_modules/**"],
  },
})
