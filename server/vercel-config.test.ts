import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type VercelConfig = {
  buildCommand?: string;
  installCommand?: string;
  outputDirectory?: string;
  functions?: Record<string, { includeFiles?: string[] }>;
  rewrites?: Array<{ source: string; destination: string }>;
};

const configPath = resolve(process.cwd(), "vercel.json");
const rawConfig = readFileSync(configPath, "utf8");
const config = JSON.parse(rawConfig) as VercelConfig;

describe("Vercel deployment contract", () => {
  it("publishes the compiled Vite frontend rather than the bundled Node server", () => {
    expect(config.buildCommand).toContain("pnpm exec vite build");
    expect(config.buildCommand).toContain("esbuild server/vercelTrpcHandler.ts");
    expect(config.installCommand).toBe("pnpm install --frozen-lockfile");
    expect(config.outputDirectory).toBe("dist/public");
    expect(config.functions?.["api/trpc/[...path].js"]?.includeFiles).toBe("**/*.json");
  });

  it("keeps the same-origin API function from being shadowed by rewrites", () => {
    expect(config.rewrites?.[0]).toEqual({
      source: "/maps-proxy/:path*",
      destination: "https://forge.butterfly-effect.dev/v1/maps/proxy/:path*",
    });
    expect(config.rewrites).toHaveLength(1);
  });

  it("contains no private runtime secret values", () => {
    expect(rawConfig).not.toMatch(/DATABASE_URL|JWT_SECRET|NASA_FIRMS_MAP_KEY|CLOUDFLARE_API_TOKEN/);
  });
});
