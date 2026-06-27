# Deploying the MCP server (free) + registering `einvoice-wolf`

Goal: get **this** server (with the Phase 1 fixes, `lookup_service`, and `wolf_` tool prefix)
on a public HTTPS URL, then register it as the `einvoice-wolf` tenant MCP so the
`voice-invoice-wolf` agent (`agt_1CcTkzST6nqLeQ3Dr7AHdQ`) calls your fixed tools.

---

## Cloudflare Workers (serverless, persistent free URL)

Files: `src/worker.js` (fetch handler), `src/core.js` (shared logic), `wrangler.toml`.
Data is bundled via JSON imports; the seller identity + `TOOL_PREFIX=wolf_` come from
`wrangler.toml [vars]` (no `seller.json` on Workers). Verified locally with
`npx wrangler dev`. The deploy needs your Cloudflare login.

```bash
cd mcp-server
# 1. Log in (one-time, opens a browser)
npx wrangler login
# 2. Set the two secrets (interactive prompts)
npx wrangler secret put EINVOICE_API_KEY
npx wrangler secret put MCP_AUTH_SECRET        # a fresh random value
# 3. Deploy
npx wrangler deploy
#    -> https://einvoice-wolf.<your-subdomain>.workers.dev
# 4. Smoke test
curl https://einvoice-wolf.<your-subdomain>.workers.dev/health   # {"ok":true,...,"services":8}
# 5. Register with Ingram (from repo root)
INGRAM_TOKEN=<544-char token> \
MCP_PUBLIC_URL=https://einvoice-wolf.<your-subdomain>.workers.dev \
MCP_AUTH_SECRET=<same value you set in step 2> \
  node ../agent/register-mcp-wolf.mjs
```
No card required; no cold-start spin-down. The collibra-hack seller identity lives in
`wrangler.toml [vars]` — edit there if it changes.

---

## Fly.io (Docker, deploys from local — no GitHub)

Provided in `mcp-server/`: `Dockerfile`, `fly.toml`, `.dockerignore`. The `.env` is
**excluded** from the image (secrets come from `fly secrets`); `data/seller.json`
(collibra-hack) **ships** with the image, so the only secrets to set are the API key
and the MCP shared secret. `TOOL_PREFIX=wolf_` is baked into `fly.toml`.

```bash
# 1. Install flyctl + log in (one-time; opens a browser, needs a card on file for the free allowance)
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Create the app (pick a globally-unique name; match it in `app =` of fly.toml)
cd mcp-server
fly apps create colihack-mcp-wolf

# 3. Set the two secrets
#    generate the shared secret:  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
fly secrets set EINVOICE_API_KEY=<your e-invoice key> MCP_AUTH_SECRET=<fresh random secret>

# 4. Deploy from local (builds the Dockerfile — no GitHub push)
fly deploy

# 5. Smoke test
curl https://colihack-mcp-wolf.fly.dev/health      # {"ok":true,...,"services":8}

# 6. Register with Ingram (from repo root)
INGRAM_TOKEN=<your 544-char Ingram admin token> \
MCP_PUBLIC_URL=https://colihack-mcp-wolf.fly.dev \
MCP_AUTH_SECRET=<the SAME secret as step 3> \
  node agent/register-mcp-wolf.mjs
```
Notes: if the app name is taken, pick another and update `app =` in `fly.toml`. For a
live demo, set `min_machines_running = 1` in `fly.toml` to avoid idle cold starts.

---

## Alternative — Render (Git-based)

Render's free **Web Service** runs the Express app as-is (no refactor), gives an
`https://<name>.onrender.com` URL, and needs no credit card. (Free instances spin
down after ~15 min idle; first request then cold-starts in ~30–60 s — fine for a demo.)

### 1. Get the code on GitHub
Render deploys from a Git repo, and these changes are still local/uncommitted, so:
- Create your own GitHub repo (or fork `bsselm/colihack`), commit this working tree, and push.
- *(Ask me and I'll commit the changes to a branch for you — I won't push to anyone's remote without your ok.)*

### 2. Create the service
[dashboard.render.com](https://dashboard.render.com) → **New → Web Service** → connect the repo.
- **Root Directory:** `mcp-server`
- **Build Command:** `npm install`
- **Start Command:** `node src/index.js`
- **Health Check Path:** `/health`
- **Instance Type:** Free

### 3. Environment variables (Render → Environment)
| Key | Value |
|-----|-------|
| `EINVOICE_API_KEY` | your e-invoice.be key |
| `MCP_AUTH_SECRET` | a **new** random shared secret (see below) — **NOT** the Ingram token |
| `TOOL_PREFIX` | `wolf_` |
| `SELLER_NAME` | `collibra-hack` |
| `SELLER_VAT` | `BE0999787908` |
| `SENDER_PEPPOL_SCHEME` | `0208` |
| `SENDER_PEPPOL_ID` | `0999787908` |
| `SELLER_ADDRESS` | e.g. `Avenue Louise 143, 1050 Bruxelles` |

> `data/seller.json` is gitignored, so it won't exist on the host — the server falls
> back to these `SELLER_*`/`SENDER_*` env vars (`getSellerInfo()`), invoicing as
> collibra-hack `BE0999787908`.

Generate a fresh shared secret:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### 4. Deploy, then smoke-test
```bash
curl https://<name>.onrender.com/health      # {"ok":true,"clients":...,"services":8}
```

### 5. Register the MCP with Ingram
```bash
INGRAM_TOKEN=<your 544-char Ingram admin token> \
MCP_PUBLIC_URL=https://<name>.onrender.com \
MCP_AUTH_SECRET=<the SAME new secret you set on Render> \
  node agent/register-mcp-wolf.mjs
```
Expect: `status: active` and all 7 `wolf_` tools discovered.

---

## ⚠️ Secret split (important)
Right now `mcp-server/.env`'s `MCP_AUTH_SECRET` actually holds the **Ingram admin
token** (mislabeled). Two *different* secrets must be kept apart:
- **`INGRAM_TOKEN`** (the 544-char value) — authenticates **you → Ingram API**. Used only by the register/agent scripts.
- **`MCP_AUTH_SECRET`** (a fresh random string) — the bearer Ingram presents to **your `/mcp`**. Set this on the host and pass the same value to the register script.

Never deploy the Ingram admin token as the server's `MCP_AUTH_SECRET` — that would
expose it on every `/mcp` call.

---

## Alternatives
- **Instant tunnel (no deploy)** — fastest for a live demo, dies when your laptop/process stops:
  ```bash
  npx cloudflared tunnel --url http://localhost:3001
  ```
  Run the server locally with `TOOL_PREFIX=wolf_` + a real `MCP_AUTH_SECRET`, then use the printed `https://*.trycloudflare.com` URL as `MCP_PUBLIC_URL` in step 5.
