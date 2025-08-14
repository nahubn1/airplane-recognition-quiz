# Airplane Spotter

A minimalist, aviation-themed quiz that tests aircraft recognition skills. Each round shows a full-screen airplane photo and 4 multiple-choice options. Beat the clock, build streaks, and climb the local leaderboard. Includes a Learn Mode for browsing models with images and specs.

---

## Live Demo

* **Production**: `https://<your-vercel-domain>.vercel.app`
  *(Replace this with the actual URL after deployment.)*

---

## Features

### Gameplay

* **High-quality photo** pulled per question (Wikipedia REST APIs with caching + robust fallbacks).
* **Exactly 4 options** (1 correct + 3 plausible distractors).
* **Immediate feedback**:

  * Correct → compact success bar with points.
  * Incorrect or timeout → a **card** shows the correct model + a short fact.
* **Timer**: fixed **15s** per question (not user-changeable).
* **Scoring**:

  * Base **100 pts** for a correct answer.
  * **Speed bonus**: proportional to time remaining.
  * **Streak bonus**: +20 per consecutive correct answer.
* **No photo repeats** within a session.

### Engagement

* **Local leaderboard** (browser `localStorage`).
* **Streak counter** + bonus points.
* **Progress bars** for time and round progress.

### Replayability

* Randomized photo selection and answer order each question.
* Option to set the **number of questions per round** (slider).

### Learn Mode

* Browse aircraft with images, type filters (commercial, military, vintage, general), quick search, and short facts/specs.

### Visuals & UX

* Minimalist UI, responsive full-bleed images.
* Smooth transitions, clean typography, dark theme.

---

## Tech Stack

* **React 18** + **TypeScript**
* **Vite**
* **Tailwind CSS**
* Image source: **Wikipedia API** (REST Summary + Media List + PageImages fallback)
* Storage: **localStorage** (leaderboard + image URL cache)

---

## Quick Start (Local)

**Prereqs**

* Node.js 18+ (LTS recommended)
* npm 9+ or pnpm/yarn

```bash
# Install
npm install

# Start dev server
npm run dev

# Build for production
npm run build
npm run preview
```

Open the dev URL (shown in your terminal), usually `http://localhost:5173`.

---

## Deploy (Vercel)

1. Push this repo to **GitHub**.
2. Go to **Vercel → New Project → Import Git Repository**.
3. Framework Preset: **Vite**
   Build Command: `npm run build`
   Output Directory: `dist`
4. Deploy.
5. Replace the **Live Demo** link above with your Vercel domain.

> Any future push to `main` will auto-deploy.

---

## Project Structure

```
.
├─ index.html
├─ package.json
├─ postcss.config.js
├─ tailwind.config.js
├─ tsconfig.json
├─ vite.config.ts
└─ src/
   ├─ main.tsx
   ├─ index.css
   └─ App.tsx        # The full quiz app lives here
```

---

## Configuration Notes

* **Timer** is fixed at **15 seconds** (by design).
* **Options per question**: always **4**.
* **Questions per round**: adjustable on the menu screen.
* **Image fetching**:

  * Tries multiple Wikipedia endpoints in this order:

    1. REST **Summary** (`originalimage`/`thumbnail`)
    2. REST **Media List** (first image)
    3. Action API **PageImages** (fallback)
  * If no image is found, the app generates a **clean SVG poster** with the model name.
  * Successful URLs are cached (in-memory + `localStorage`) for speed.
* **No exact photo repeats** in the same session (best-effort, with fallback attempts).

---

## Scoring Details

* **Correct** = 100 + `round((timeLeft / 15s) * 100)` + `streak * 20`
* **Incorrect/Timeout** = 0 points; streak resets.
* Feedback card shows the correct answer and a short fact when you miss it.

---

## Leaderboard

* Stored locally in `localStorage` (key: `airquiz_leaderboard_v1`).
* Keeps top 10 scores by default.
* (Optional future: Switch to a hosted DB like Supabase for global boards.)

---

## Learn Mode

* Filter by **type** (commercial, military, vintage, general).
* Quick search by model or role.
* Displays image, role, and a short fact for each aircraft.

---

## Attribution & Licensing of Images

* Photos are fetched from **Wikipedia/Wikimedia** at runtime.
* Images on Wikipedia are contributed under various licenses (often **CC BY-SA**).
* This app does not redistribute images; it displays them directly from Wikipedia.
* If you publish screenshots or reuse images, ensure proper **attribution** per the source page’s license.

---

## Troubleshooting

* **Images not loading**

  * Network fluke: try again or check the console.
  * Clear cache: in DevTools → Application → Local Storage → remove keys like `wikiimg:*`.
  * Wikipedia throttling: temporary; the SVG fallback ensures the app still works.

* **Vercel build fails**

  * Ensure Node version is recent on Vercel (defaults are fine for Vite).
  * Confirm `Build Command` is `npm run build` and `Output Directory` is `dist`.

---

## Development Notes / Internals

* Exactly **4** options enforced with `slice(0, OPTIONS_PER_QUESTION - 1)`.
* Timer: `useCountdown` hook restarts on question key change; locks on answer or timeout.
* Session de-dupe for **models** and **photos** using `Set` refs.
* Dev sanity checks via `console.assert` (non-blocking) to catch regressions.

---

## Roadmap (nice-to-haves)

* Keyboard shortcuts: **1–4** to answer, **N** for next.
* Global leaderboard via Supabase/Firebase (with RLS).
* Sound effects + subtle haptics (mobile).
* Per-type difficulty and adaptive scoring.
* Offline “internal dataset” image source.

---

## Contributing

PRs welcome! For significant changes, please open an issue to discuss your proposal first. Keep the **15s timer** and **4 options** constraints unless we make them configurable behind a flag.

---

## License

Choose a license that fits your needs (e.g., **MIT**).
*Add a `LICENSE` file to the repo when decided.*

---

## Acknowledgements

* Wikipedia & Wikimedia contributors (images & data).
* Aircraft communities and enthusiasts worldwide.
