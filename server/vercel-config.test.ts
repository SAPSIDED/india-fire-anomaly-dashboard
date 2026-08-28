import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type VercelConfig = {
  buildCommand?: string;
  installCommand?: string;
  outputDirectory?: string;
  rewrites?: Array<{ source: string; destination: string }>;
};

const configPath = resolve(process.cwd(), "vercel.json");
const rawConfig = readFileSync(configPath, "utf8");
const config = JSON.parse(rawConfig) as VercelConfig;

describe("Vercel deployment contract", () => {
  it("publishes the compiled Vite frontend rather than the bundled Node server", () => {
    expect(config.buildCommand).toBe("pnpm exec vite build");
    expect(config.installCommand).toBe("pnpm install --frozen-lockfile");
    expect(config.outputDirectory).toBe("dist/public");
  });

  it("proxies API requests before applying the SPA fallback", () => {
    expect(config.rewrites?.[0]).toEqual({
      source: "/api/:path*",
      destination: "https://firedash-4ykkjf9a.manus.space/api/:path*",
    });
    expect(config.rewrites?.[1]).toEqual({
      source: "/:path*",
      destination: "/index.html",
    });
  });

  it("contains no private runtime secret values", () => {
    expect(rawConfig).not.toMatch(/DATABASE_URL|JWT_SECRET|NASA_FIRMS_MAP_KEY|CLOUDFLARE_API_TOKEN/);
  });
});
