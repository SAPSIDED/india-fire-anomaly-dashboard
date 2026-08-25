import { describe, expect, it } from "vitest";

describe("FIRMS_RELAY_BASE_URL", () => {
  it("returns the deployed relay health response", async () => {
    const baseUrl = process.env.FIRMS_RELAY_BASE_URL;
    expect(baseUrl).toBeTruthy();

    const response = await fetch(`${baseUrl?.replace(/\/+$/, "")}/healthz`, {
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json() as { status?: string; service?: string };

    expect(response.ok).toBe(true);
    expect(payload).toMatchObject({ status: "ok", service: "fireguard-firms-relay" });
  }, 20_000);
});
