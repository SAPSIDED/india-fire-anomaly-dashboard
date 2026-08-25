import { readFile } from "node:fs/promises";

const token = process.env.CLOUDFLARE_API_TOKEN;
const firmsMapKey = process.env.NASA_FIRMS_MAP_KEY;
const workerName = "fireguard-firms-relay";
const compatibilityDate = "2026-08-25";

if (!token || !firmsMapKey) {
  throw new Error("CLOUDFLARE_API_TOKEN and NASA_FIRMS_MAP_KEY must be configured server-side.");
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const message = payload.errors?.map(error => error.message).join("; ") || `HTTP ${response.status}`;
    throw new Error(`Cloudflare ${path}: ${message}`);
  }
  return payload.result;
}

const accounts = await cloudflare("/accounts?per_page=50");
const accountId = accounts?.[0]?.id;
if (!accountId) throw new Error("No authorized Cloudflare account was returned by the deployment token.");

const source = await readFile(new URL("../cloudflare-relay/fireguard-firms-relay.mjs", import.meta.url), "utf8");
const body = new FormData();
body.set("metadata", new Blob([JSON.stringify({ main_module: "fireguard-firms-relay.mjs", compatibility_date: compatibilityDate })], { type: "application/json" }));
body.set("fireguard-firms-relay.mjs", new Blob([source], { type: "application/javascript+module" }), "fireguard-firms-relay.mjs");

await cloudflare(`/accounts/${accountId}/workers/scripts/${workerName}`, { method: "PUT", body });

for (const [name, text] of Object.entries({
  NASA_FIRMS_MAP_KEY: firmsMapKey,
  // The FireGuard backend already holds this same key server-side. It is never exposed to the browser.
  RELAY_AUTH_TOKEN: firmsMapKey,
})) {
  await cloudflare(`/accounts/${accountId}/workers/scripts/${workerName}/secrets`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, text, type: "secret_text" }),
  });
}

await cloudflare(`/accounts/${accountId}/workers/workers/${workerName}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ subdomain: { enabled: true } }),
});

let subdomain;
try {
  subdomain = await cloudflare(`/accounts/${accountId}/workers/subdomain`);
} catch {
  subdomain = await cloudflare(`/accounts/${accountId}/workers/subdomain`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subdomain: `fireguard-${accountId.slice(0, 8)}` }),
  });
}
if (!subdomain?.subdomain) throw new Error("Cloudflare did not return a workers.dev subdomain.");

console.log(JSON.stringify({
  workerName,
  relayBaseUrl: `https://${workerName}.${subdomain.subdomain}.workers.dev`,
  healthUrl: `https://${workerName}.${subdomain.subdomain}.workers.dev/healthz`,
  deployment: "success",
}, null, 2));
