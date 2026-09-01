---
name: freestyle
description: Build and operate Freestyle v5 cloud VMs (beta-api.freestyle.sh) — VM lifecycle, exec, filesystem, style.dev preview URLs via TLS rules. Use whenever running untrusted code, installing packages, previewing or deploying apps on Freestyle.
---

# Freestyle v5 (current API)

Base URL: `https://beta-api.freestyle.sh` — NOT `api.freestyle.sh/v1` (legacy, rejects new keys with 401).
Auth: `Authorization: Bearer $FREESTYLE_API_KEY`.

Live docs: https://www.freestyle.sh/docs — machine-readable map at `/docs/llms.txt`, stateless shell: `curl https://www.freestyle.sh/docs/bash --data-binary 'cat /docs/vms/domains.md'`.
OpenAPI: https://beta-api.freestyle.sh/openapi.json
npm SDK: `freestyle` (`new Freestyle()` reads `FREESTYLE_API_KEY`).

## Core rules learned (verified live 2026-08)

- **Create VM**: `POST /v5/vms` — `firewall` is REQUIRED. Outbound-allow-all:
  `{"firewall":{"rules":[{"action":"allow","source":{},"destination":{"public":true}}]},"idleTimeoutSeconds":1800}`
  Boots straight to `state:"running"` (~100ms). Response is the full Vm object (`id`, `state`, `resources`, `publicIpv6`). Default image `freestyle/ubuntu` (Ubuntu 24.04, Node preinstalled as v24).
- **No implicit domains in v5.** Preview URL = TLS ingress rule on a free `*.style.dev` subdomain:
  `POST /v5/tls {"action":"allow","domain":"<name>.style.dev","protocol":"http","source":{"public":true},"destination":{"vmId":"<id>","port":3000}}`
  style.dev names need no verification/DNS; platform wildcard cert covers them. First account to claim a name owns it.
- **Exec**: `POST /v5/vms/{id}/exec-await {"command":"...","timeoutMs":N}` — `timeoutMs` HARD-CAPPED at 300000 (5 min); split long installs/builds into stages. Killed commands return `statusCode: null` → treat as failure (124).
- **Filesystem**: JSON write `PUT /v5/vms/{id}/fs/write {"path":"/abs/path","content":"...","encoding":"utf8"}` (≤32 MiB; larger via octet-stream or `/fs/uploads` chunked flow). Read streams bytes: `GET /v5/vms/{id}/fs/read?path=...` (NOT JSON — decode text). Dir: `GET .../fs/dir?path=...` → `{entries:[{name,kind}]}` where kind ∈ file|directory|symlink. Also `fs/exists`, `fs/stat`, `fs/mkdir` (POST), `fs/remove` (DELETE).
- **Lifecycle**: `POST /v5/vms/{id}/start` (then poll `GET /v5/vms/{id}` until `state==="running"`), `POST .../pause` (no "stop" — pause preserves disk), `DELETE /v5/vms/{id}`. States: starting|running|pausing|paused|stopped.
- **No git/hosting APIs in v5** (`/git/v1/*`, `/web/v1/deploy` are legacy-only). Persist source to GitHub; "deploy" = serve `dist/` on a VM port (e.g. `npx http-server dist -p 8080`) behind a stable per-project style.dev TLS name.
- VM create options: `snapshotId`, `idleTimeoutSeconds` (pause on idle), `ttlSeconds`, `autoDeleteSeconds`, `maxRunSeconds`, `slug`, `metadata` (≤64 entries, 63-char keys/values), `exec` (run command on boot, `onExit: continue|stop|snapshot`).

## Reference docs map

- `/docs/quickstart.md`, `/docs/vms/index.md`, `/docs/vms/lifecycle.md`, `/docs/vms/files.md`, `/docs/vms/domains.md`, `/docs/vms/base-snapshots.md`, `/docs/vms/pricing-and-limits.md`, `/docs/vms/pty.md`, `/docs/vms/ssh.md`
- Guides: run-nodejs / run-vite / run-nextjs / run-docker / run-postgres etc. under `/docs/guides/`.
