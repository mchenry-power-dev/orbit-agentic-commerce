import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "/orbit-agentic-commerce/",
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
