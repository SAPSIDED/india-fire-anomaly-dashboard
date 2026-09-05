import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Vercel map fallback interaction contract", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/components/Map.tsx"), "utf8");

  it("keeps the optimized hover preview and fullscreen interaction in the fallback", () => {
    expect(source).toContain("function HotspotHoverPreview");
    expect(source).toContain('loading="lazy"');
    expect(source).toContain("requestFullscreen");
    expect(source).toContain("exitFullscreen");
    expect(source).toContain("fireguard-provider-grid");
  });
});
