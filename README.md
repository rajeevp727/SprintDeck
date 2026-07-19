# SprintDeck

Real-time sprint estimation for distributed teams. A moderator
creates a room, shares the code/link, the team queues stories and votes with
Fibonacci cards — votes stay hidden until everyone's in, then the average and
consensus reveal instantly. Runs **free/near-free** on Azure.

**Live:** https://sprintdeck.rajeevstech.in (also `…azurestaticapps.net`)

- **Frontend:** React + TypeScript + Vite
- **API:** Azure Functions (Node v4), served at `/api` by Static Web Apps
- **Storage:** Azure Cosmos DB (serverless) — shared across instances, durable across cold starts
- **Sync:** short polling every 1.5s (no extra real-time infra)
- **Join model:** shareable room code / invite link, no login

## Features

- **Story queue** — moderator pastes tickets (one per line) and works through them in order.
- **Hidden voting** — others' votes are never sent to the client until reveal (can't be peeked).
- **Reveal** — shows the average + a "Consensus 🎯" badge when everyone agrees.
- **Results history + export** — every estimated story is saved; export to `.txt` or Excel `.csv`.
- **Moderator controls** — start/reveal/clear, **Save & next**, **Finish**, **End room**.
- **Moderator-only** Invite + Results; Results unlocks once all queued stories are estimated.
- **Resilience** — survives tab focus-loss and transient blips; an error boundary replaces blank screens with a reload prompt.
- **Ads** (optional) — Google AdSense slots, dormant until a publisher slot id is set.

## Architecture

```
Browsers ──poll /api/session/{code}──▶ Azure Static Web App ──▶ Azure Functions ──▶ Cosmos DB
   ▲  vote / reveal / queue (POST)        (static site + /api)      (poker.js)        (one doc per room,
   └─────────── JSON state ◀──────────────────────────────────────────────────────   /code partition, 2h TTL)
```

- **One document per room** in Cosmos (`db: sprintdeck`, container: `sessions`, partition key `/code`).
- **Native TTL** auto-expires idle rooms (2h idle; 5h hard cap).
- `api/src/store.js` is backend-agnostic: uses Cosmos when `COSMOS_CONNECTION_STRING` is set, else an in-memory `Map` fallback (single-instance, for local dev).

## Run locally

Two terminals. The API falls back to in-memory storage locally (no Cosmos needed),
or set `COSMOS_CONNECTION_STRING` in `api/local.settings.json` to use Cosmos.

```bash
# 1. API (needs Azure Functions Core Tools v4)
cd api && npm install && npm start     # -> http://localhost:7071

# 2. Frontend (Vite dev server proxies /api -> :7071)
npm install && npm run dev             # -> http://localhost:5173
```

Or run both at once from the repo root:

```bash
npm run dev:all     # web + API together
npm run dev:lan     # same, but exposes the web server on your LAN for phone testing
```

Open the URL, create a session, and open the invite link in another browser/incognito
window to simulate a teammate.

## Deploy (Azure Static Web Apps, free)

1. Push to GitHub (auto-deploys via `.github/workflows/`).
2. Azure Portal → **Static Web App** (Free): source = this repo/branch `main`,
   **App location** `/`, **Api location** `api`, **Output location** `dist`.
3. **Configure storage** (required for persistence) — Static Web App → **Settings →
   Environment variables** → add `COSMOS_CONNECTION_STRING` = your Cosmos
   **primary/secondary connection string** (`AccountEndpoint=…;AccountKey=…;`).
   Without it the app runs in-memory (rooms vanish on cold start / across instances).
4. Every push to `main` rebuilds and deploys.

### Custom domain
Static Web App → **Custom domains → Add → "Custom domain on other DNS"**. For a
subdomain, create a `CNAME` at your DNS host pointing to the `…azurestaticapps.net`
host, then validate. Azure issues free SSL automatically.

## Configuration

| Setting | Where | Purpose |
|---|---|---|
| `COSMOS_CONNECTION_STRING` | SWA env var | Cosmos connection (enables persistence) |
| `DECK_MAX` | `api/src/store.js` | Top of the Fibonacci deck (default 21 → `1,2,3,5,8,13,21`) |
| `MAX_PARTICIPANTS` | `api/src/store.js` | Room cap (default 20) |
| `SESSION_IDLE_MS` / `SESSION_MAX_AGE_MS` | `api/src/store.js` | Room expiry (2h idle / 5h max) |
| `ADSENSE_CLIENT` / `ADSENSE_SLOT` | `src/adsConfig.ts` | AdSense publisher + slot ids (ads off until both set) |

## API reference

| Method | Route | Who | Purpose |
|---|---|---|---|
| GET | `/api/health` | anyone | Keep-warm / liveness check |
| POST | `/api/session` | anyone | Create a room (optional custom `code`); caller is moderator |
| POST | `/api/session/{code}/join` | anyone | Join with a name (max 20) |
| GET | `/api/session/{code}?participantId=` | anyone | Poll state (votes hidden until revealed) |
| POST | `/api/session/{code}/vote` | participant | Cast/clear a vote |
| POST | `/api/session/{code}/start` | moderator | Start a story (explicit or next in queue) |
| POST | `/api/session/{code}/reveal` | moderator | Reveal cards + average |
| POST | `/api/session/{code}/reset` | moderator | Clear votes, vote again |
| POST | `/api/session/{code}/story` | moderator | Rename current story |
| POST | `/api/session/{code}/queue` | moderator | Add stories to the queue |
| DELETE | `/api/session/{code}/queue/{storyId}` | moderator | Remove a queued story |
| POST | `/api/session/{code}/next` | moderator | Save result to history, advance queue |
| POST | `/api/session/{code}/end` | moderator | End the room for everyone |

## Project layout

```
sprintdeck/
├─ api/                          # Azure Functions (Node v4)
│  ├─ src/store.js               # Cosmos-backed store (+ in-memory fallback), domain logic
│  ├─ src/functions/poker.js     # all HTTP endpoints
│  └─ host.json, package.json
├─ src/                          # React app
│  ├─ components/Home.tsx        # create / join + footer
│  ├─ components/Room.tsx        # table: seats, deck, queue, reveal, moderator panel
│  ├─ components/ResultsModal.tsx# history table + export
│  ├─ components/Privacy.tsx     # privacy policy + about (for AdSense)
│  ├─ components/AdBanner.tsx, StickyAd.tsx, ErrorBoundary.tsx
│  ├─ api.ts                     # typed fetch client (cache: no-store)
│  ├─ export.ts                  # .txt / .csv export
│  ├─ storage.ts                 # per-room identity (localStorage)
│  ├─ adsConfig.ts               # AdSense ids
│  ├─ App.tsx                    # hash router (#/room/CODE, #/privacy)
│  └─ types.ts
├─ public/ads.txt                # AdSense ownership
├─ staticwebapp.config.json      # SPA fallback + no-store on /api
├─ vite.config.ts                # dev proxy /api -> :7071
└─ .github/workflows/            # SWA deploy
```
