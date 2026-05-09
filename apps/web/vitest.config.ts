import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // Single fork (Vitest 4 syntax) pour que les tests DB ne se marchent pas
    // dessus si on partage une connection pg (rare mais possible).
    pool: "forks",
    fileParallelism: false,
  },
});
