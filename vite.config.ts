import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { createHmac } from "crypto";
import { visualizer } from "rollup-plugin-visualizer";
import { compression, defineAlgorithm } from "vite-plugin-compression2";
import { constants as zlibConstants } from "zlib";
import { VitePWA } from "vite-plugin-pwa";
import { devServerBridgePlugin } from "@lovable.dev/vite-plugin-dev-server-bridge";

/**
 * Dev/preview API middlewares run the SAME auth + rate-limit guard as the
 * Vercel handlers in `api/`, so preview can never be more permissive than
 * production. Returns false when the request was already answered.
 */
async function devApiGuard(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void },
  endpoint: string,
): Promise<boolean> {
  const { guardNodeRequest } = await import("./src/lib/api/apiGuard");
  const result = await guardNodeRequest(req, endpoint);
  if (result.ok) return true;
  res.statusCode = result.status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (result.retryAfter) res.setHeader("Retry-After", String(result.retryAfter));
  res.end(JSON.stringify({ error: result.error ?? "Unauthorized" }));
  return false;
}

function createIntegrationAppToken() {
  const workspaceKey = process.env.INTEGRATION_APP_WORKSPACE_KEY ?? process.env.MEMBRANE_WORKSPACE_KEY;
  const workspaceSecret = process.env.INTEGRATION_APP_WORKSPACE_SECRET ?? process.env.MEMBRANE_WORKSPACE_SECRET;

  if (!workspaceKey || !workspaceSecret) {
    throw new Error("Integration.app workspace credentials missing");
  }

  const base64Url = (input: string | Buffer) =>
    Buffer.from(input)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      id: "demo-user",
      name: "Demo User",
      fields: {},
      iss: workspaceKey,
      iat: now,
      exp: now + 60 * 60,
    }),
  );
  const body = `${header}.${payload}`;
  const signature = createHmac("sha256", workspaceSecret).update(body).digest();
  return `${body}.${base64Url(signature)}`;
}

function integrationAppTokenDevPlugin(): Plugin {
  return {
    name: "integration-app-token-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/integration-app-token", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }

        try {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ token: createIntegrationAppToken() }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "token_generation_failed" }));
        }
      });
    },
  };
}

function anythingApiDevPlugin(): Plugin {
  return {
    name: "anything-api-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/anything", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "anything"))) return;
          let payload: unknown = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { proxyAnythingRequest } = await import("./src/lib/anything/proxy-core");
            const result = await proxyAnythingRequest(
              payload as Record<string, unknown>,
              process.env.ANYTHING_API_KEY,
            );
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : "proxy_failed" }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalent of api/manus-admin.ts so the /m page works in preview. */
function manusAdminDevPlugin(): Plugin {
  return {
    name: "manus-admin-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/manus-admin", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          let payload: unknown = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { handleManusAdmin } = await import("./src/lib/manus/adminCore");
            const result = await handleManusAdmin(payload as never, process.env.M_ADMIN_PASSWORD);
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : "manus_admin_failed" }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalents of api/dev-admin.ts and api/dev-agent.ts (Dev Agent). */
function devAgentDevPlugin(): Plugin {
  const json = (
    path: string,
    endpoint: string | null,
    run: (payload: unknown) => Promise<{ status: number; body: Record<string, unknown> }>,
  ) =>
    (server: ViteDevServer) => {
      server.middlewares.use(path, (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (endpoint && !(await devApiGuard(req as never, res as never, endpoint))) return;
          let payload: unknown = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const result = await run(payload);
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : "dev_agent_failed" }),
            );
          }
        });
      });
    };

  return {
    name: "dev-agent-dev",
    configureServer(server: ViteDevServer) {
      json("/api/dev-admin", null, async (payload) => {
        const { handleDevAdmin } = await import("./src/lib/devagent/adminCore");
        return handleDevAdmin(payload as never, process.env.M_ADMIN_PASSWORD);
      })(server);
      json("/api/dev-agent", "dev-agent", async (payload) => {
        const { handleDevAgent } = await import("./src/lib/devagent/core");
        return handleDevAgent(payload as never);
      })(server);
    },
  };
}

/** Dev-server equivalent of api/computer-agent.ts (in-chat Computer Agent). */
function computerAgentDevPlugin(): Plugin {
  return {
    name: "computer-agent-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/computer-agent", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "computer-agent"))) return;
          let payload: unknown = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { handleComputerAgent } = await import("./src/lib/manus/agentCore");
            const result = await handleComputerAgent(payload as never);
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : "computer_agent_failed" }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalent of api/long-run.ts (Trigger.dev + E2B computer sessions). */
function longRunDevPlugin(): Plugin {
  return {
    name: "long-run-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/long-run", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "long-run"))) return;
          let payload: unknown = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { handleLongRun } = await import("./src/lib/longrun/core");
            const result = await handleLongRun(payload as never);
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : "long_run_failed" }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalent of api/mcp.ts (connected tool servers). */
function mcpDevPlugin(): Plugin {
  return {
    name: "mcp-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/mcp", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "mcp"))) return;
          let payload: unknown = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { handleMcpGateway } = await import("./src/lib/mcp/gatewayCore");
            const result = await handleMcpGateway(payload as never);
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "mcp_failed" }),
            );
          }
        });
      });
    },
  };
}


// Connected-app agent tools now live in the backend function (anything-api,
// action kind: "tools"), which already holds the provider credentials.



/** Dev-server equivalent of api/clerk.ts (Apple sign-in bridge + app integrations). */
function clerkDevPlugin(): Plugin {
  return {
    name: "clerk-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/clerk", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          let payload: unknown = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { handleClerk } = await import("./src/lib/clerk/bridgeCore");
            const result = await handleClerk(payload as never);
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "clerk_failed" }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalent of api/web-search.ts (Deep Research live sources). */
function webSearchDevPlugin(): Plugin {
  return {
    name: "web-search-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/web-search", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "web-search"))) return;
          let payload: { query?: string; count?: number; offset?: number } | null = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { webSearch } = await import("./src/lib/search/webSearchCore");
            const data = await webSearch(
              String(payload?.query ?? ""),
              Number(payload?.count ?? 8),
              Number(payload?.offset ?? 0),
            );
            res.statusCode = 200;
            res.end(JSON.stringify(data));
          } catch (error) {
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                results: [],
                error: error instanceof Error ? error.message : "search_failed",
              }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalent of api/read-url.ts (Deep Research page reader). */
function readUrlDevPlugin(): Plugin {
  return {
    name: "read-url-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/read-url", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "read-url"))) return;
          let payload: { urls?: string[]; maxChars?: number } | null = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { readUrls } = await import("./src/lib/search/readUrlCore");
            const pages = await readUrls(
              Array.isArray(payload?.urls) ? payload!.urls!.map(String) : [],
              Number(payload?.maxChars ?? 9000),
            );
            res.statusCode = 200;
            res.end(JSON.stringify({ pages }));
          } catch (error) {
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                pages: [],
                error: error instanceof Error ? error.message : "read_failed",
              }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalent of api/deep-research.ts. */
function deepResearchDevPlugin(): Plugin {
  return {
    name: "deep-research-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/deep-research", (req, res) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "deep-research"))) return;
          let payload: Record<string, any> | null = null;
          try {
            payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
          } catch {
            payload = null;
          }
          try {
            const { streamDeepResearch } = await import("./src/lib/research/deepResearchCore");
            const response = await streamDeepResearch(payload ?? {});
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) {
              res.end();
              return;
            }
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            res.end();
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "deep_research_failed",
              }),
            );
          }
        });
      });
    },
  };
}

/** Dev-server equivalent of api/transcribe.ts (composer mic dictation). */
function transcribeDevPlugin(): Plugin {
  return {
    name: "transcribe-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/transcribe", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          if (!(await devApiGuard(req as never, res as never, "transcribe"))) return;
          try {
            const buf = Buffer.concat(chunks);
            const request = new Request("http://localhost/api/transcribe", {
              method: "POST",
              headers: { "content-type": String(req.headers["content-type"] || "") },
              body: buf,
            });
            const form = await request.formData();
            const file = form.get("file");
            const language = String(form.get("language") || "") || undefined;
            if (!(file instanceof Blob)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ text: "", error: "No audio uploaded" }));
              return;
            }
            const { transcribeAudio } = await import("./src/lib/audio/transcribeCore");
            const filename = (file as File).name || undefined;
            const { status, body } = await transcribeAudio(file, { language, filename });
            res.statusCode = status;
            res.end(JSON.stringify(body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                text: "",
                error: error instanceof Error ? error.message : "transcription_failed",
              }),
            );
          }
        });
      });
    },
  };
}

// Stamps index.html's `%VITE_BUILD_ID%` placeholder with a real value. Without
// it Vite logs a "not defined in env" warning on every dev start and ships the
// raw placeholder to production.
const buildIdPlugin = () => ({
  name: "megsy-build-id",
  transformIndexHtml(html: string) {
    return html.replace(/%VITE_BUILD_ID%/g, String(Date.now()));
  },
});

export default defineConfig({
  plugins: [
    buildIdPlugin(),
    devServerBridgePlugin(),

    // React Compiler is a Babel pass over every component. On Vercel Hobby it
    // pushes the build close to the 3-minute timeout, so keep it everywhere
    // except the production build step.
    react({
      babel: process.env.VERCEL
        ? undefined
        : {
            plugins: [
              // React Compiler — auto-memoizes every component and hook across
              // the site. Eliminates unnecessary re-renders without hand-written
              // React.memo / useMemo / useCallback everywhere. Runs at build time.
              ["babel-plugin-react-compiler", { target: "19" }],
            ],
          },
    }),
    integrationAppTokenDevPlugin(),
    anythingApiDevPlugin(),
    manusAdminDevPlugin(),
    devAgentDevPlugin(),
    computerAgentDevPlugin(),
    longRunDevPlugin(),
    mcpDevPlugin(),
    clerkDevPlugin(),
    webSearchDevPlugin(),
    readUrlDevPlugin(),
    deepResearchDevPlugin(),


    transcribeDevPlugin(),
    VitePWA({
      // "prompt" (not autoUpdate): the service worker must never take control
      // mid-session and reload the page under the user. Updates are applied on
      // the next natural visit, or when the user taps our manual toast.
      registerType: "prompt",
      injectRegister: null,
      strategies: "generateSW",
      filename: "sw.js",
      devOptions: { enabled: false },
      includeAssets: [
        "offline.html",
        "robots.txt",
      ],
      manifestFilename: "site.webmanifest",
      manifest: false,
      workbox: {
        // Precache ONLY the app shell (entry JS + CSS + HTML + tiny icons/fonts).
        // Everything else — code-split route chunks, syntax highlighting
        // grammars, mermaid diagram types, images — is cached at runtime via
        // CacheFirst on first request. This keeps first-install download
        // under ~1MB instead of ~44MB and dramatically speeds up SW install.
        globPatterns: [
          "index.html",
          "offline.html",
          "site.webmanifest",
          "assets/index-*.{js,css}",
          "assets/react-vendor-*.js",
          "*.{ico,webmanifest}",
        ],
        globIgnores: [
          "**/megsy-push-sw.js",
          "**/service-worker.js",
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/api\//,
          /^\/auth\//,
          /^https:\/\/[^/]+\.supabase\.co\//,
          /^https:\/\/[^/]+\.supabase\.in\//,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-nav",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 40, maxAgeSeconds: 24 * 60 * 60 },
              // If both the network and the precache miss (e.g. index.html
              // hasn't been cached yet on a brand-new offline install), fall
              // back to the static offline page instead of a broken request.
              plugins: [
                {
                  handlerDidError: async () => caches.match("/offline.html"),
                },
              ],
            },
          },
          {
            // Hashed, immutable build output — safe to cache aggressively.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "build-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            // Images: first request downloads, every later one is served from
            // the local cache without touching the network.
            urlPattern: ({ url }) =>
              /\.(?:png|jpe?g|webp|avif|svg|gif|ico)$/i.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "img-assets",
              expiration: { maxEntries: 400, maxAgeSeconds: 90 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Static JSON data (i18n dictionaries, template registries, etc.).
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.json$/i.test(url.pathname) && !url.pathname.includes("manifest"),
            handler: "CacheFirst",
            options: {
              cacheName: "static-json",
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Cross-origin fonts + stylesheets (Google Fonts) and CDN assets.
            urlPattern: ({ url, sameOrigin }) =>
              !sameOrigin &&
              (/fonts\.(?:googleapis|gstatic)\.com$/.test(url.hostname) ||
                url.pathname.startsWith("/__l5e/assets-v1/")),
            handler: "CacheFirst",
            options: {
              cacheName: "external-assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:woff2?|ttf|otf)$/i.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
    // Vercel compresses responses at the edge. Generating thousands of
    // maximum-quality Brotli/Gzip files during its build can exceed its time
    // limit, so retain pre-compression only for other static hosts.
    ...(process.env.VERCEL
      ? []
      : [
          compression({
            algorithms: [
              defineAlgorithm("brotliCompress", {
                params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
              }),
              defineAlgorithm("gzip", { level: 9 }),
            ],
            exclude: [/\.(br|gz|png|jpe?g|webp|avif|woff2?|mp4|webm)$/i],
            threshold: 1024,
          }),
        ]),
    // Enable with `ANALYZE=1 bun run build` — writes dist/stats.html.
    ...(process.env.ANALYZE
      ? [
          visualizer({
            filename: "dist/stats.html",
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
          }) as Plugin,
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Static HTML templates under public/templates/* import 3D libs from CDNs
    // (three/addons, stats-gl, etc.) directly in the browser. Vite's dep
    // scanner tries to resolve them from node_modules and warns on every boot.
    // They are not part of the app bundle — exclude them from scanning.
    entries: ["index.html", "src/**/*.{ts,tsx}"],
    // Pre-bundle icon + date + class helper libs once. They ship hundreds of
    // tiny ESM files; without pre-bundling the dev server issues a separate
    // request per icon / helper (thousands of round-trips) — the single biggest
    // source of dev-time lag. Prod already tree-shakes them via package exports.
    include: [
      "use-sync-external-store/shim/with-selector",
      "lucide-react",
      "date-fns",
      "date-fns/locale",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      // Brand icons are dynamically imported per-brand (BrandIcon.tsx). Without
      // pre-bundling, the first render of a new brand triggers a mid-session
      // dep re-optimize, which invalidates already-loaded chunk URLs and makes
      // the page hang with "Failed to fetch dynamically imported module".
      ...[
        "Flux","Bfl","OpenAI","Gemini","NanoBanana","Ideogram","Recraft","ByteDance","Doubao",
        "Alibaba","Kling","Minimax","Runway","Stability","Grok","XAI","Fal","Sora","Luma","Pika",
        "PixVerse","Hailuo","Hedra","Hunyuan","CogVideo","Kolors","Krea","Midjourney","Dalle",
        "TopazLabs","Claude","Anthropic","Perplexity","Zhipu","Kimi",
      ].map((n) => `@lobehub/icons/es/${n}`),
    ],


    exclude: ["msw", "@mswjs/interceptors"],
  },

  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
  // Drop console.* and debugger from production JS via esbuild — no terser install needed.
  esbuild: {
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
    legalComments: "none",
  },
  // Workers must be single-file bundles — disable manualChunks/external for
  // the worker build so `new Worker(new URL(...))` compiles cleanly.
  worker: {
    format: "es",
    rollupOptions: {
      output: { manualChunks: undefined, inlineDynamicImports: true },
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 1200,
    minify: "esbuild",
    // Vercel's build log shows the reporter stalling while computing gzip
    // sizes for thousands of chunks (including a 23 MB WASM). The sizes are
    // only used for the CLI table; disabling them avoids the timeout without
    // affecting the emitted bundle.
    reportCompressedSize: false,

    // Vite's default modulepreload preloads the transitive graph of every async
    // chunk reachable from the entry, which made the landing page eagerly fetch
    // ~1MB of markdown/syntax/icons/chat code. Fully disabling it fixed that but
    // created a request waterfall instead: the browser could only discover the
    // React runtime AFTER downloading + parsing the entry chunk. Allow-list just
    // the shell chunks so they download in parallel with the entry, and nothing
    // route-specific is preloaded.
    modulePreload: {
      polyfill: false,
      resolveDependencies: (_file, deps) =>
        deps.filter((dep) => /(^|\/)(react-vendor|supabase)-[^/]+\.js$/.test(dep)),
    },

    rollupOptions: {
      external: [/^npm:/, /^https?:\/\//, /^jsr:/, /^node:/],
      output: {
        // Keep only the truly universal runtime packages in a shared vendor
        // chunk. Everything else is left to Rollup's default splitter so that
        // route-specific dependencies (markdown, syntax highlighting, lobehub
        // brand icons, radix widgets, framer-motion, etc.) travel with the
        // async chunk that actually uses them instead of being force-hoisted
        // into the entry graph. This is the fix for the "landing page loads
        // 3.9 MB of JS" regression.
        manualChunks(id) {
          // Vite's dynamic-import preload helper is a virtual module. Left to
          // Rollup it got parked inside a random async chunk (assistant-ui),
          // which then had to be downloaded before first paint. Pin it next to
          // the React runtime so the shell never drags a route chunk with it.
          if (id.includes("vite/preload-helper")) return "react-vendor";
          if (!id.includes("node_modules")) return;
          // Tiny runtime helpers shared by many packages. Left unpinned they
          // land in whichever async chunk Rollup picks first, which forces the
          // shell to download an unrelated route chunk at boot.
          if (
            id.includes("@babel/runtime") ||
            /[\\/]node_modules[\\/]tslib[\\/]/.test(id)
          ) {
            return "react-vendor";
          }

          // Truly universal — only the React runtime + router live in the
          // entry chunk. Everything else must travel with the route/component
          // that first imports it, Facebook-style.
          if (
            /[\\/]node_modules[\\/]react-dom[\\/]/.test(id) ||
            /[\\/]node_modules[\\/]react[\\/]/.test(id) ||
            id.includes("scheduler") ||
            id.includes("react-router") ||
            // Radix depends heavily on React and has internal circular deps.
            // Splitting it into its own chunk caused a production race where
            // `radix` executed before `react-vendor` finished initializing,
            // throwing "Cannot read properties of undefined (reading
            // 'forwardRef')" and leaving the app on a black splash. Keep
            // Radix bundled with React so imports resolve in-file, top-down.
            id.includes("@radix-ui")
          ) {
            return "react-vendor";
          }
          // Keep Integration.app out of react-vendor. Its package path is
          // accidentally bundled the SDK into the React runtime chunk. The SDK
          // imports SWR/client helpers that also live in other async chunks,
          // creating a production circular import and crashing before mount
          // with "Cannot access '<var>' before initialization".
          // @assistant-ui is a core chat dependency and MUST NOT share a chunk
          // with the 1 MB Integration.app SDK — otherwise opening /chat pulls
          // the whole integrations SDK down before first paint.
          if (id.includes("@assistant-ui")) return "assistant-ui";
          if (id.includes("@supabase")) return "supabase";


          // Motion must stay in one chunk. Splitting Framer Motion internals
          // across `motion-core` / `motion-features` can break its circular
          // initialization order in production builds and crash before React
          // mounts, leaving the app on a blank black screen.
          if (id.includes("framer-motion")) {
            return "motion";
          }

          // @lobehub icons: split per provider so a page that only shows OpenAI
          // doesn't fetch Anthropic + Google + Grok + 50 more SVG chunks.
          if (id.includes("@lobehub")) {
            // Real path shape is `@lobehub/icons/es/<IconName>/index.js` and
            // shared internals live under `@lobehub/icons/es/features|utils|...`.
            const m = id.match(/@lobehub\/icons\/(?:es|dist|lib)\/([^/]+)/i);
            if (m) {
              const seg = m[1].toLowerCase();
              // Keep shared runtime in a single small chunk; each brand icon
              // gets its own chunk so pages only pay for what they render.
              if (["features", "utils", "type", "types", "style", "hooks"].includes(seg)) {
                return "lobehub-runtime";
              }
              return `lobehub-${seg}`;
            }
            return "lobehub-core";
          }

          // lucide-react: one shared "icons" chunk containing ONLY the icons
          // the app actually imports (the `import * as Lucide` barrel that
          // used to defeat tree-shaking is gone). Left to Rollup, every icon
          // became its own ~1 kB chunk and the first load fired 60+ extra HTTP
          // requests — pure latency with no payload benefit.
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
            return "icons";
          }

          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("rehype-") ||
            id.includes("micromark") ||
            id.includes("mdast-") ||
            id.includes("hast-") ||
            id.includes("unified") ||
            id.includes("unist-")
          ) {
            return "markdown";
          }
          // Bundle only the highlighter runtime here — leave per-language
          // grammars (prism/{lang} + refractor/lang/{lang}) as separate
          // dynamic chunks so `CodeBlockHighlighter` can fetch them per
          // fenced block instead of shipping every language up-front.
          if (
            (id.includes("react-syntax-highlighter") ||
              id.includes("refractor") ||
              id.includes("prismjs") ||
              id.includes("highlight.js")) &&
            !/[\\/](languages|lang)[\\/]prism[\\/]/.test(id) &&
            !/react-syntax-highlighter[\\/]dist[\\/](esm|cjs)[\\/]languages[\\/]/.test(id) &&
            !/refractor[\\/]lang[\\/]/.test(id) &&
            !/prismjs[\\/]components[\\/]/.test(id)
          ) {
            return "syntax";
          }
          if (id.includes("date-fns") || id.includes("dayjs")) return "date";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("hls.js")) return "hls";
          if (id.includes("lenis")) return "lenis";
          // Heavy editor / doc / media libs — isolate so they never get
          // hoisted into the entry graph and only load on the routes that
          // actually use them.
          // NOTE: for libs that ship many small dynamically-imported modules
          // (shiki language grammars, mermaid diagram types, monaco language
          // workers, tiptap extensions), we intentionally DO NOT group them
          // into a single chunk. Grouping forces Rollup to hoist every
          // dynamic import into one giant file (14–19MB), destroying the
          // lazy loading these libs were designed for. Let Rollup split.
          if (id.includes("monaco-editor/esm/vs/editor/editor.main")) return "monaco-core";
          if (id.includes("gsap")) return "gsap";
          if (id.includes("xlsx")) return "xlsx";
          if (id.includes("mammoth")) return "mammoth";
          if (id.includes("pdfjs-dist")) return "pdfjs";
          if (id.includes("@react-pdf")) return "react-pdf";
          if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("html-to-image")) return "pdf-export";
          if (id.includes("pptxgenjs") || id.includes("pptx-preview") || id.includes("docx") || id.includes("jszip") || id.includes("file-saver")) return "office";
          if (id.includes("@ffmpeg")) return "ffmpeg";
          if (id.includes("@imgly")) return "imgly";
          if (id.includes("@paper-design") || id.includes("simplex-noise")) return "shaders";
          if (id.includes("@sentry")) return "sentry";
          if (id.includes("@telegram-apps") || id.includes("@twa-dev")) return "telegram";
        },
      },
    },

  },
});
