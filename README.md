# Airplane Spotter

Airplane Spotter is a fast, responsive aircraft-recognition quiz. Identify aircraft from real photos, learn the visual details that distinguish them, and compare your best score on a global leaderboard.

**Live app:** [airplane-recognition-quiz.pages.dev](https://airplane-recognition-quiz.pages.dev/)

## Highlights

- 10-question rounds with 15 seconds and four choices per question.
- More than 140 commercial, military, vintage, and general-aviation aircraft.
- Speed and streak bonuses with immediate answer feedback.
- A responsive interface designed for desktop, tablet, and mobile screens.
- Learn Mode with filtering, aircraft facts, specifications, and Wikipedia links.
- A global leaderboard backed by Cloudflare D1, with an offline browser fallback.
- No registration or login required.

## Image loading

Aircraft photos are resolved from Wikipedia and Wikimedia Commons. The app starts warming five images while the player is still on the menu and continues preloading upcoming images during a round.

The timer begins only after the current image has downloaded and decoded. A pulsing skeleton is displayed while loading, so a slow connection never consumes the player's answer time. Successful image URLs and decoded images are cached to reduce repeat downloads.

## Anonymous player profiles

On first use, the browser receives:

- A random device identifier stored locally.
- A generated callsign such as `Kestrel482` or `Aurora731`.

The profile is reused automatically after every quiz. Players are not asked to enter a username after each round; they can rename themselves from Settings whenever they want.

The server stores one best score per browser identity. Clearing site storage, using private browsing, or switching devices creates a new anonymous identity.

## Scoring

For every correct answer:

```text
100 + round((time remaining / 15) * 100) + (current streak * 20)
```

Incorrect answers and timeouts award no points and reset the streak.

## Technology

- React 18 and TypeScript
- Vite
- Tailwind CSS
- Cloudflare Pages Functions
- Cloudflare D1
- Wikipedia and Wikimedia Commons APIs
- Browser `localStorage` for profiles, image URLs, completion state, and offline scores

## Run locally

Requirements:

- Node.js 18 or newer
- npm

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally [http://127.0.0.1:5173](http://127.0.0.1:5173).

Create a production build with:

```bash
npm run build
npm run preview
```

When running through Vite alone, the quiz works normally and the leaderboard uses its offline fallback because Cloudflare Pages Functions are not present in the Vite server.

## Deploy to Cloudflare Pages

The repository includes the Pages Functions, D1 migration, and `wrangler.jsonc` configuration required for the global leaderboard.

### 1. Create the database

```bash
npx wrangler d1 create airplane-quiz-leaderboard
```

Copy the returned database ID into the `d1_databases` entry in `wrangler.jsonc`. Keep the binding name exactly `DB`.

### 2. Apply the schema

```bash
npx wrangler d1 migrations apply airplane-quiz-leaderboard --remote
```

On a corporate network that installs its own trusted certificate, Wrangler may need Windows' system certificate store:

```powershell
$env:NODE_USE_SYSTEM_CA='1'
npx wrangler d1 migrations apply airplane-quiz-leaderboard --remote
```

Do not disable TLS verification.

### 3. Create a Pages project

In Cloudflare, select **Workers & Pages → Create application → Pages → Import an existing Git repository** and use:

- Root directory: `/`
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`

A Pages Git deployment does not need a custom deploy command. If the setup requires `npx wrangler deploy`, it is the Workers Builds workflow rather than the Pages workflow used by this project.

### 4. Confirm the D1 binding

In the Pages project, open **Settings → Bindings** and connect the D1 database using the variable name `DB`. Redeploy after adding or changing a binding.

Every subsequent push to `main` will trigger a new production deployment.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/leaderboard` | Returns the ten highest scores. |
| `POST` | `/api/scores` | Creates or updates an anonymous profile and its best score. |

Usernames accept 3–24 letters, numbers, underscores, or hyphens. A username cannot belong to more than one anonymous device identity.

## Project structure

```text
.
├── assets/                 Source design assets
├── functions/api/         Cloudflare Pages API routes
├── migrations/            D1 database migrations
├── public/                 Public app assets
├── src/
│   ├── App.tsx             Quiz UI and application logic
│   ├── aircraftData.ts     Aircraft catalogue
│   ├── index.css           Global and responsive styles
│   └── main.tsx            React entry point
├── index.html
├── package.json
├── vite.config.ts
└── wrangler.jsonc
```

## Image attribution

Photos are loaded at runtime from Wikipedia and Wikimedia Commons. Individual images may use different licenses, commonly Creative Commons licenses. Follow the source page's attribution and reuse requirements when redistributing an image or publishing it outside the app.

## Contributing

Issues and pull requests are welcome. Please keep the core round format—10 questions, 15 seconds, and four answer choices—consistent unless the change intentionally redesigns the game.
