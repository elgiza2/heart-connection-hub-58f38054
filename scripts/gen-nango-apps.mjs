/** Generates src/lib/apiApps/nango.generated.ts from Nango's provider registry.
 *
 *  Nango publishes one YAML file describing ~1000 real SaaS APIs: the proxy base
 *  URL, how the credential is sent, and — for key/secret based providers — the
 *  exact named credential fields the service asks for (with titles, help text
 *  and example values). That is exactly what the APIs tab needs: every app knows
 *  its own field names instead of one generic "API key" box, and Nango also
 *  hosts a logo per provider so no row is left without an icon.
 *
 *  Usage: bun scripts/gen-nango-apps.mjs
 */
import { writeFileSync } from "node:fs";
import YAML from "yaml";

const SOURCE =
  "https://raw.githubusercontent.com/NangoHQ/nango/master/packages/providers/providers.yaml";

/** Only credential-based providers: the user can paste values and be done. */
const MODES = new Set(["API_KEY", "BASIC", "TWO_STEP", "OAUTH2_CC", "JWT", "SIGNATURE", "TBA"]);

/** Nango category → the app category union used by the UI. */
const CATEGORY = {
  payment: "finance",
  banking: "finance",
  accounting: "finance",
  invoicing: "finance",
  crm: "data",
  support: "comms",
  ticketing: "comms",
  communication: "comms",
  messaging: "comms",
  video: "media",
  design: "media",
  social: "media",
  marketing: "comms",
  productivity: "data",
  dev: "dev",
  "dev-tools": "dev",
  hosting: "dev",
  ai: "ai",
  search: "search",
  analytics: "data",
  legal: "data",
  hr: "data",
  ats: "data",
  erp: "data",
  ecommerce: "finance",
  storage: "data",
};

const CATEGORY_LABEL = {
  payment: "payments",
  banking: "banking",
  accounting: "accounting",
  crm: "CRM",
  support: "customer support",
  ticketing: "ticketing",
  communication: "communication",
  messaging: "messaging",
  video: "video",
  design: "design",
  social: "social",
  marketing: "marketing",
  productivity: "productivity",
  dev: "developer tools",
  "dev-tools": "developer tools",
  hosting: "hosting",
  ai: "AI",
  search: "search",
  analytics: "analytics",
  hr: "HR",
  ats: "recruiting",
  erp: "ERP",
  ecommerce: "e-commerce",
  storage: "file storage",
  popular: "popular",
};

const title = (name) =>
  name
    .split("-")
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");

/** `${connectionConfig.subdomain}` → `${subdomain}` so one lookup fills them all. */
const plain = (value) => String(value).replace(/\$\{[\w.]*?([\w]+)\}/g, "${$1}");

const templates = (value) => Array.from(String(value).matchAll(/\$\{([\w.]+)\}/g), (m) => m[1]);

/** "Affinity (v2)", "ADP (Client Credentials)" → "Affinity", "ADP". */
const cleanName = (name) =>
  name
    .replace(
      /\s*\((basic auth|client credentials|api key|personal access token|service user|oauth\d?|jwt|sandbox|v\d+(\.\d+)?)\)\s*$/i,
      "",
    )
    .trim();

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`providers.yaml: ${res.status}`);
const providers = YAML.parse(await res.text());

const apps = [];
for (const [id, provider] of Object.entries(providers)) {
  if (!provider || typeof provider !== "object") continue;
  if (!MODES.has(provider.auth_mode)) continue;
  // Some entries list alternates ("https://${host} || https://fallback"); take the first.
  const baseUrl = provider.proxy?.base_url?.split("||")[0].trim();
  if (!baseUrl) continue;

  const creds = provider.credentials ?? {};
  const fields = Object.entries(creds)
    .filter(([, spec]) => spec && spec.type !== "boolean")
    .map(([name, spec]) => ({
      name,
      label: spec.title || title(name),
      description: (spec.description || "").replace(/\s+/g, " ").trim(),
      example: typeof spec.example === "string" ? spec.example : "",
      secret: /secret|password|token|key/i.test(name) || spec.secret === true,
    }));

  if (provider.auth_mode === "BASIC" && fields.length === 0) {
    fields.push(
      { name: "username", label: "Username", description: "", example: "", secret: false },
      { name: "password", label: "Password", description: "", example: "", secret: true },
    );
  }
  if (fields.length === 0) {
    fields.push({ name: "apiKey", label: "API key", description: "", example: "", secret: true });
  }

  // Some services live on a per-customer host: ask for that part of the URL too.
  const hostVars = templates(baseUrl).map((v) => v.split(".").pop());
  for (const name of hostVars) {
    if (fields.some((f) => f.name === name)) continue;
    const spec = provider.connection_config?.[name] ?? {};
    fields.unshift({
      name,
      label: spec.title || title(name),
      description: (spec.description || "").replace(/\s+/g, " ").trim(),
      example: typeof spec.example === "string" ? spec.example : "",
      secret: false,
    });
  }

  // How the credential travels on every request, straight from Nango's proxy config.
  const headers = {};
  for (const [name, value] of Object.entries(provider.proxy?.headers ?? {})) {
    if (typeof value !== "string") continue;
    const needed = templates(value).map((n) => n.split(".").pop());
    if (needed.some((n) => !fields.some((f) => f.name === n))) continue;
    headers[name] = plain(value);
  }
  const params = {};
  for (const [name, value] of Object.entries(provider.proxy?.query_params ?? {})) {
    if (typeof value !== "string") continue;
    params[name] = plain(value);
  }

  // Nango records a verification endpoint per provider: a real call the saved
  // credentials can make straight away, so no app is left without an action.
  const check = provider.proxy?.verification;
  const endpoint = Array.isArray(check?.endpoints)
    ? typeof check.endpoints[0] === "string"
      ? check.endpoints[0]
      : check.endpoints[0]?.endpoint
    : undefined;
  const tools =
    endpoint && !String(endpoint).includes("${")
      ? [
          {
            name: "Check connection",
            description: "Calls the service to confirm your credentials work",
            method: (check.method || "GET").toUpperCase() === "POST" ? "POST" : "GET",
            path: String(endpoint).startsWith("/") ? String(endpoint) : `/${endpoint}`,
            params: [],
          },
        ]
      : [];

  const cats = provider.categories ?? [];
  const category = cats.map((c) => CATEGORY[c]).find(Boolean) ?? "data";
  const label = cats.map((c) => CATEGORY_LABEL[c]).find((c) => c && c !== "popular");

  const rawName = provider.display_name || title(id);
  apps.push({
    id: `nango:${id}`,
    name: cleanName(rawName),
    variant: /\(/.test(rawName),
    category,
    description: label ? `${label} API — connect with your own credentials` : "Connect with your own API credentials",
    docsUrl: provider.docs_connect || provider.docs || "https://www.nango.dev/integrations",
    keyUrl: provider.setup_guide_url || provider.docs_connect || provider.docs || "",
    baseUrl: plain(baseUrl).replace(/\/$/, ""),
    logo: `https://app.nango.dev/images/template-logos/${id}.svg`,
    credentials: fields,
    basic: provider.auth_mode === "BASIC",
    tools,
    authTemplate: {
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(Object.keys(params).length ? { params } : {}),
    },
    popular: cats.includes("popular"),
  });
}

// Popular first, then the plainest entry of each service (so "Affinity" wins
// over "Affinity (v1)") — the tab keeps one row per name.
apps.sort(
  (a, b) =>
    Number(b.popular) - Number(a.popular) ||
    Number(a.variant) - Number(b.variant) ||
    a.name.localeCompare(b.name),
);

const body = `/** GENERATED by scripts/gen-nango-apps.mjs — do not edit by hand.
 *
 *  ${apps.length} real SaaS APIs from Nango's provider registry. Each entry carries the
 *  service's own named credential fields, its proxy base URL, how the credential
 *  is sent on every request, and a logo.
 */
import type { ApiApp } from "./types";

export const NANGO_APPS: ApiApp[] = ${JSON.stringify(
  apps.map(({ popular, variant, ...app }) => app),
  null,
  2,
)};
`;

writeFileSync("src/lib/apiApps/nango.generated.ts", body);

// A brand logo per service name — used by hand-written apps too, so no row is
// left with a letter placeholder.
const logos = {};
for (const [id, provider] of Object.entries(providers)) {
  const name = (provider?.display_name || title(id)).trim().toLowerCase();
  if (!name || logos[name]) continue;
  logos[name] = `https://app.nango.dev/images/template-logos/${id}.svg`;
}
writeFileSync(
  "src/lib/apiApps/logos.generated.ts",
  `/** GENERATED by scripts/gen-nango-apps.mjs — brand logo per service name. */
export const SERVICE_LOGOS: Record<string, string> = ${JSON.stringify(logos, null, 2)};

/** Logo for a service name, if the registry knows one. */
export const serviceLogo = (name: string): string | undefined =>
  SERVICE_LOGOS[name.trim().toLowerCase()];
`,
);
console.log(`wrote ${apps.length} apps and ${Object.keys(logos).length} logos`);
