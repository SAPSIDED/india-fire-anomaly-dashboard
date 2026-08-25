import { describe, expect, it } from "vitest";

describe("CLOUDFLARE_API_TOKEN", () => {
  it("authorizes the Cloudflare token verification endpoint", async () => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    expect(token).toBeTruthy();

    const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json() as { success?: boolean; errors?: Array<{ message?: string }> };

    expect(payload.success, payload.errors?.map(error => error.message).join(", ")).toBe(true);
  }, 15_000);
});
