import React, { useEffect, useMemo, useRef, useState } from "react";
import { AIRCRAFT_DB, TYPES, type Aircraft } from "./aircraftData";

// ==========================
// Airplane Recognition Quiz
// ==========================
// Single-file React app implementing:
// - Random aircraft photo (Wikipedia API by default, with graceful fallback)
// - Exactly 4 multiple-choice options (per user request)
// - Immediate feedback with a short fact (wrong answers show a card)
// - Timer fixed to 15s, speed/accuracy scoring, streak + bonus
// - Global leaderboard with a localStorage offline fallback
// - Replayability (randomization, no photo/model repeats per session)
// - Minimalist aviation-themed UI, responsive full-bleed photo
// - Smooth transitions between questions
// - Learn Mode with filtering + specs browser
// - Filter quiz by type (commercial, military, vintage, general)
//
// Notes:
// - Set IMAGE_SOURCE = 'wikipedia' (default) to fetch images per model from Wikipedia.
// - If Wikipedia has no image for a specific title, we fallback to a generated SVG poster.
// - To plug a different API, implement fetchImageForAircraft().

// --------------------------
// Config
// --------------------------
const QUIZ_DEFAULTS = {
  questionTimeSec: 15, // fixed
  questionsPerRun: 10,
};

const OPTIONS_PER_QUESTION = 4; // Fixed at 4 choices

const IMAGE_SOURCE: "wikipedia" | "internal" = "wikipedia";
const QUIZ_COMPLETED_KEY = "airquiz_completed_quiz_v1";
const IMAGE_WARM_QUEUE_SIZE = 5;
const PLAYER_PROFILE_KEY = "airquiz_player_v1";
const PLAYER_STATS_KEY = "airquiz_player_stats_v1";
const LOCAL_LEADERBOARD_KEY = "airquiz_leaderboard_v1";
const PRIMARY_APP_ORIGIN = "https://airplane-recognition-quiz.vercel.app";
const LEGACY_APP_HOSTS = new Set(["airplane-recognition-quiz.pages.dev"]);
const IDENTITY_TRANSFER_PARAM = "player-transfer";

type LeaderboardEntry = { name: string; score: number; date: string; deviceId?: string };
type AnonymousProfile = { deviceId: string; username: string; usernameChosen: boolean };
type PlayerStats = { personalBest: number; bestStreak: number; rank?: number | null; totalPlayers?: number; topPercent?: number | null };
type PersonalRecord = { beaten: boolean; previousBest: number; newBest: number; rank?: number | null; totalPlayers?: number; topPercent?: number | null };

function encodeIdentityTransfer(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeIdentityTransfer(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isValidTransferredProfile(value: any): value is AnonymousProfile {
  return Boolean(
    value &&
    typeof value.deviceId === "string" &&
    value.deviceId.length > 0 &&
    value.deviceId.length <= 100 &&
    typeof value.username === "string" &&
    /^[A-Za-z0-9_-]{3,24}$/.test(value.username) &&
    typeof value.usernameChosen === "boolean"
  );
}

function sanitizeTransferredStats(value: any): PlayerStats | null {
  if (!value || !Number.isFinite(value.personalBest) || !Number.isFinite(value.bestStreak)) return null;
  return {
    personalBest: Math.max(0, Math.min(2900, Math.trunc(value.personalBest))),
    bestStreak: Math.max(0, Math.min(10, Math.trunc(value.bestStreak))),
    rank: Number.isFinite(value.rank) ? Math.max(1, Math.trunc(value.rank)) : null,
    totalPlayers: Number.isFinite(value.totalPlayers) ? Math.max(0, Math.trunc(value.totalPlayers)) : undefined,
    topPercent: Number.isFinite(value.topPercent) ? Math.max(1, Math.min(100, Math.trunc(value.topPercent))) : null,
  };
}

function transferLegacyBrowserIdentity() {
  if (typeof window === "undefined") return;
  try {
    if (window.location.origin === PRIMARY_APP_ORIGIN) {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const encoded = hash.get(IDENTITY_TRANSFER_PARAM);
      if (!encoded) return;
      const transfer = decodeIdentityTransfer(encoded);
      if (isValidTransferredProfile(transfer?.profile)) {
        localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(transfer.profile));
        const stats = sanitizeTransferredStats(transfer?.stats);
        if (stats) localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(stats));
        if (transfer?.completed === true) localStorage.setItem(QUIZ_COMPLETED_KEY, "true");
      }
      hash.delete(IDENTITY_TRANSFER_PARAM);
      const cleanHash = hash.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ""}`);
      return;
    }

    if (LEGACY_APP_HOSTS.has(window.location.hostname)) {
      const profile = JSON.parse(localStorage.getItem(PLAYER_PROFILE_KEY) || "null");
      const stats = JSON.parse(localStorage.getItem(PLAYER_STATS_KEY) || "null");
      const completed = localStorage.getItem(QUIZ_COMPLETED_KEY) === "true";
      const transfer = isValidTransferredProfile(profile)
        ? encodeIdentityTransfer({ profile, stats, completed })
        : "";
      window.location.replace(`${PRIMARY_APP_ORIGIN}/${transfer ? `#${IDENTITY_TRANSFER_PARAM}=${transfer}` : ""}`);
    }
  } catch {
    // A blocked storage API should not prevent either deployment from loading.
  }
}

transferLegacyBrowserIdentity();

const CALLSIGN_BASES = [
  "Ace", "Albatross", "Arrow", "Atlas", "Aurora", "Badger", "Beacon", "Bear",
  "Bluebird", "Bolt", "Breeze", "Buzzard", "Canyon", "Cardinal", "Cedar", "Cheetah",
  "Cirrus", "Cobra", "Comet", "Condor", "Corsair", "Cougar", "Crane", "Cricket",
  "Cyclone", "Dagger", "Dawn", "Delta", "Dragon", "Eagle", "Echo", "Ember",
  "Falcon", "Firefly", "Fox", "Ghost", "Glider", "Hawk", "Heron", "Horizon",
  "Hornet", "Hunter", "Ibis", "Jet", "Kestrel", "Kite", "Lance", "Lark",
  "Lightning", "Lynx", "Mako", "Merlin", "Meteor", "Mirage", "Mustang", "Nomad",
  "Nova", "Orion", "Osprey", "Otter", "Owl", "Panther", "Pegasus", "Phantom",
  "Phoenix", "Piper", "Polar", "Puma", "Quasar", "Raven", "Raptor", "Rocket",
  "Sabre", "Scout", "Shadow", "Shark", "Sierra", "Skyhawk", "Skylark", "Sparrow",
  "Specter", "Spirit", "Starling", "Storm", "Swift", "Talon", "Tempest", "Tiger",
  "Titan", "Tornado", "Trident", "Turbo", "Viper", "Voyager", "Vulcan", "Wasp",
  "Wildcat", "Wolf", "Zephyr",
];

function generateCallsign() {
  const suffix = choice(CALLSIGN_BASES);
  const number = String(100 + randInt(900));
  return `${suffix}${number}`;
}

function normalizeUsername(username: string) {
  return username.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

function getAnonymousProfile(): AnonymousProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_PROFILE_KEY) || "null");
    if (saved?.deviceId && saved?.username) return { ...saved, usernameChosen: saved.usernameChosen === true };
  } catch {
    // Create a fresh anonymous profile below.
  }
  const profile = {
    deviceId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    username: generateCallsign(),
    usernameChosen: false,
  };
  try {
    localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // The profile remains valid for this browser session.
  }
  return profile;
}

function saveAnonymousUsername(username: string, usernameChosen = true) {
  const profile = getAnonymousProfile();
  const updated = { ...profile, username, usernameChosen };
  try {
    localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(updated));
  } catch {
    // Continue with the in-memory submission when storage is unavailable.
  }
  return updated;
}

function readPlayerStats(): PlayerStats {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_STATS_KEY) || "null");
    if (saved && Number.isFinite(saved.personalBest)) return saved;
  } catch { /* use empty stats */ }
  return { personalBest: 0, bestStreak: 0 };
}

function writePlayerStats(stats: PlayerStats) {
  try { localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(stats)); } catch { /* best effort */ }
}

// --------------------------
// Utilities
// --------------------------
function randInt(n: number) {
  return Math.floor(Math.random() * n);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function choice<T>(arr: T[]): T {
  return arr[randInt(arr.length)];
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getHasCompletedQuiz() {
  try {
    return localStorage.getItem(QUIZ_COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

// Generate a crisp SVG poster as a fallback when a photo is unavailable
function posterFor(model: string, type: string) {
  const palette: Record<string, string> = {
    commercial: "#0ea5e9",
    military: "#64748b",
    vintage: "#d97706",
    general: "#10b981",
  };
  const bg = palette[type] || "#0ea5e9";
  const svg = `<?xml version='1.0' encoding='UTF-8'?>
  <svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='${bg}'/>
        <stop offset='100%' stop-color='#0b1020'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' fill='url(#g)'/>
    <g fill='white' opacity='0.08'>
      <circle cx='200' cy='150' r='120'/>
      <circle cx='1450' cy='220' r='160'/>
      <circle cx='1200' cy='750' r='220'/>
    </g>
    <g fill='white' opacity='0.22'>
      <path d='M350 620 c200 -90 400 -140 650 -150 l220 -10 -180 65 c-210 77 -420 130 -690 160z' />
    </g>
    <g font-family='ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto' fill='white'>
      <text x='80' y='780' font-size='48' opacity='0.7'>Airplane Recognition</text>
      <text x='80' y='850' font-size='80' font-weight='700'>${model.replace(/&/g, '&amp;')}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Wikipedia API cache (in-memory + localStorage)
const wikiCache: Record<string, string> = {};
const decodedImageCache = new Set<string>();
const COMMONS_EXTERIOR_SEARCH: Record<string, string> = {
  "Gulfstream G650": "Gulfstream G650 aircraft exterior in flight",
};
const PREFERRED_AIRCRAFT_IMAGES: Record<string, string> = {
  "Gulfstream G650":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/G-ULFS_Gulfstream_G650_CVT_05-05-16_%2827046023031%29_%28cropped%29.jpg/1280px-G-ULFS_Gulfstream_G650_CVT_05-05-16_%2827046023031%29_%28cropped%29.jpg",
};

function fetchWithTimeout(url: string, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() =>
    window.clearTimeout(timeout)
  );
}

function preloadImage(url: string, timeoutMs = 15000): Promise<void> {
  if (decodedImageCache.has(url)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = "";
      reject(new Error("Image download timed out"));
    }, timeoutMs);

    image.onload = async () => {
      window.clearTimeout(timeout);
      try {
        if (image.decode) await image.decode();
      } catch {
        // A completed load is still safe to display if decode() is unsupported.
      }
      decodedImageCache.add(url);
      resolve();
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Image download failed"));
    };
    image.src = url;
  });
}

async function fetchWikipediaImage(model: string): Promise<string | null> {
  if (PREFERRED_AIRCRAFT_IMAGES[model]) {
    return PREFERRED_AIRCRAFT_IMAGES[model];
  }
  const cacheKey = `wikiimg:v2:${model}`;
  if (wikiCache[cacheKey]) return wikiCache[cacheKey];
  const ls = localStorage.getItem(cacheKey);
  if (ls) {
    wikiCache[cacheKey] = ls;
    return ls;
  }

  const exteriorSearch = COMMONS_EXTERIOR_SEARCH[model];
  if (exteriorSearch) {
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        exteriorSearch
      )}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|mime&iiurlwidth=1000&format=json&origin=*`;
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        const pages = Object.values(data?.query?.pages || {}) as any[];
        const exterior = pages
          .map((page) => page?.imageinfo?.[0])
          .find((info) => info?.mime?.startsWith("image/") && info?.thumburl);
        const exteriorUrl = exterior?.thumburl || exterior?.url;
        if (exteriorUrl) {
          wikiCache[cacheKey] = exteriorUrl;
          try {
            localStorage.setItem(cacheKey, exteriorUrl);
          } catch {
            // Continue without persistent caching when storage is unavailable.
          }
          return exteriorUrl;
        }
      }
    } catch {
      // Do not fall back to an interior lead image for an exterior-only entry.
    }
    return null;
  }

  const tryTitles = [model, `${model} (aircraft)`, model.replaceAll("-", " ")];
  const results = await Promise.all(
    tryTitles.map(async (t) => {
      try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=thumbnail|original&pithumbsize=1000&titles=${encodeURIComponent(
        t
      )}&origin=*`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages || {};
      for (const k of Object.keys(pages)) {
        const p = pages[k];
        const src = p?.thumbnail?.source || p?.original?.source;
        if (src) return src as string;
      }
      return null;
      } catch {
        return null;
      }
    })
  );

  const src = results.find((result): result is string => !!result);
  if (src) {
    wikiCache[cacheKey] = src;
    try {
      localStorage.setItem(cacheKey, src);
    } catch {
      // Continue without persistent caching when storage is unavailable.
    }
    return src;
  }

  // Some aircraft pages have no usable lead image. Search Wikimedia Commons
  // directly so a valid photo can still be found for the aircraft.
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      model
    )}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=1000&format=json&origin=*`;
    const response = await fetchWithTimeout(searchUrl);
    if (response.ok) {
      const data = await response.json();
      const pages = Object.values(data?.query?.pages || {}) as any[];
      const image = pages
        .map((page) => page?.imageinfo?.[0])
        .find((info) => info?.mime?.startsWith("image/") && info?.thumburl);
      const commonsUrl = image?.thumburl || image?.url;
      if (commonsUrl) {
        wikiCache[cacheKey] = commonsUrl;
        try {
          localStorage.setItem(cacheKey, commonsUrl);
        } catch {
          // Continue without persistent caching when storage is unavailable.
        }
        return commonsUrl;
      }
    }
  } catch {
    // The caller will try another aircraft or show the retry state.
  }
  return null;
}

async function fetchImageForAircraft(a: Aircraft): Promise<string> {
  if (IMAGE_SOURCE === "internal") {
    return posterFor(a.model, a.type);
  }
  const wiki = await fetchWikipediaImage(a.wikiTitle || a.model);
  return wiki || posterFor(a.model, a.type);
}

// --------------------------
// Hooks
// --------------------------
function useCountdown(
  seconds: number,
  isRunning: boolean,
  onElapsed: () => void,
  restartKey?: any
) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const startedAt = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const onElapsedRef = useRef(onElapsed);

  useEffect(() => {
    onElapsedRef.current = onElapsed;
  }, [onElapsed]);

  // Reset timer when seconds or restartKey changes
  useEffect(() => {
    setTimeLeft(seconds);
    startedAt.current = null;
  }, [seconds, restartKey]);

  useEffect(() => {
    if (!isRunning) return;
    startedAt.current = performance.now();
    const tick = () => {
      if (startedAt.current == null) return;
      const elapsed = (performance.now() - startedAt.current) / 1000;
      const left = Math.max(0, seconds - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        onElapsedRef.current();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [isRunning, seconds, restartKey]);

  return timeLeft;
}

// --------------------------
// Main App
// --------------------------
export default function AirplaneQuizApp() {
  const [screen, setScreen] = useState<"menu" | "quiz" | "learn" | "result">(
    "menu"
  );

  // Settings
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>({
    commercial: true,
    military: true,
    vintage: true,
    general: true,
  });
  const questionTimeSec = QUIZ_DEFAULTS.questionTimeSec; // fixed, not user-editable
  const questionsPerRun = QUIZ_DEFAULTS.questionsPerRun; // fixed, not user-editable

  // Quiz runtime state
  const [questionIndex, setQuestionIndex] = useState(0);
  const [current, setCurrent] = useState<{
    correct: Aircraft | null;
    options: Aircraft[];
    imageUrl: string | null;
    questionKey: number;
  } | null>(null);
  const [questionStatus, setQuestionStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [imageLoadError, setImageLoadError] = useState("");
  const questionRequestRef = useRef(0);
  const warmupPromiseRef = useRef<Promise<void> | null>(null);
  const warmedImagesRef = useRef<Set<string>>(new Set());

  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<
    | null
    | { correct: boolean; fact: string; correctModel: string; points: number; selectedId?: string }
  >(null);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const seenPhotosRef = useRef<Set<string>>(new Set());

  const filteredDB = useMemo(() => {
    const enabled = new Set(
      TYPES.filter((t) => enabledTypes[t]).map((t) => t as string)
    );
    return AIRCRAFT_DB.filter((a) => enabled.has(a.type));
  }, [enabledTypes]);

  async function warmAircraftImages(aircraft: Aircraft[], count = IMAGE_WARM_QUEUE_SIZE) {
    const targets = shuffle(aircraft).slice(0, count);
    await Promise.all(targets.map(async (item) => {
      try {
        const url = IMAGE_SOURCE === "internal"
          ? posterFor(item.model, item.type)
          : await fetchWikipediaImage(item.wikiTitle || item.model);
        if (!url || warmedImagesRef.current.has(url)) return;
        await preloadImage(url);
        warmedImagesRef.current.add(url);
      } catch {
        // Demand loading will retry any image that could not be warmed.
      }
    }));
  }

  useEffect(() => {
    if (screen !== "menu" || filteredDB.length < OPTIONS_PER_QUESTION) return;
    if (!warmupPromiseRef.current) {
      warmupPromiseRef.current = warmAircraftImages(filteredDB).finally(() => {
        warmupPromiseRef.current = null;
      });
    }
  }, [screen, filteredDB]);

  // Global leaderboard with a local offline fallback.
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_LEADERBOARD_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [leaderboardOnline, setLeaderboardOnline] = useState(false);
  const [playerProfile, setPlayerProfile] = useState<AnonymousProfile>(() =>
    getAnonymousProfile()
  );
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => readPlayerStats());
  const [playerStanding, setPlayerStanding] = useState<(LeaderboardEntry & { rank?: number | null; totalPlayers?: number; topPercent?: number | null }) | null>(null);
  const [personalRecord, setPersonalRecord] = useState<PersonalRecord | null>(null);
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);

  async function refreshGlobalLeaderboard() {
    try {
      const [response, playerResponse] = await Promise.all([
        fetch("/api/leaderboard", { headers: { Accept: "application/json" } }),
        fetch("/api/player", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ deviceId: playerProfile.deviceId }) }),
      ]);
      if (!response.ok) throw new Error("Leaderboard unavailable");
      const data = await response.json();
      if (!Array.isArray(data?.leaderboard)) throw new Error("Invalid leaderboard response");
      setLeaderboard(data.leaderboard);
      if (playerResponse.ok) {
        const playerData = await playerResponse.json();
        if (playerData?.player) {
          setPlayerStanding(playerData.player);
          const nextStats = { personalBest: Number(playerData.player.score || 0), bestStreak: Number(playerData.player.bestStreak || 0), rank: playerData.player.rank, totalPlayers: playerData.player.totalPlayers, topPercent: playerData.player.topPercent };
          setPlayerStats((current) => ({ ...current, ...nextStats, personalBest: Math.max(current.personalBest, nextStats.personalBest), bestStreak: Math.max(current.bestStreak, nextStats.bestStreak) }));
          writePlayerStats(nextStats);
        }
      }
      setLeaderboardOnline(true);
    } catch {
      setLeaderboardOnline(false);
    }
  }

  useEffect(() => {
    void refreshGlobalLeaderboard();
  }, []);

  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [hasCompletedQuiz, setHasCompletedQuiz] = useState(() =>
    getHasCompletedQuiz()
  );

  // Generate next question
  async function nextQuestion(resetKey = false) {
    if (filteredDB.length < OPTIONS_PER_QUESTION) return;
    const requestId = ++questionRequestRef.current;
    setCurrent(null);
    setQuestionStatus("loading");
    setImageLoadError("");

    let pool = filteredDB.filter((a) => !seenIdsRef.current.has(a.id));
    if (pool.length === 0) {
      seenIdsRef.current.clear();
      pool = filteredDB;
    }

    // Try several aircraft so one broken remote photo does not block the run.
    const candidates = shuffle(pool).slice(0, Math.min(4, pool.length));
    for (const correct of candidates) {
      try {
        const distractors = shuffle(
          filteredDB.filter((a) => a.id !== correct.id)
        ).slice(0, OPTIONS_PER_QUESTION - 1);
        const options = shuffle([correct, ...distractors]);
        const questionKey = resetKey ? Date.now() : Math.random();
        setCurrent({ correct, options, imageUrl: null, questionKey });

        const imageUrl =
          IMAGE_SOURCE === "internal"
            ? posterFor(correct.model, correct.type)
            : await fetchWikipediaImage(correct.wikiTitle || correct.model);
        if (!imageUrl || seenPhotosRef.current.has(imageUrl)) continue;

        // This downloads and decodes the actual image before the timer can start.
        await preloadImage(imageUrl);
        if (requestId !== questionRequestRef.current) return;

        seenPhotosRef.current.add(imageUrl);
        setCurrent({
          correct,
          options,
          imageUrl,
          questionKey,
        });
        setQuestionStatus("ready");
        void warmAircraftImages(
          filteredDB.filter((aircraft) => aircraft.id !== correct.id),
          IMAGE_WARM_QUEUE_SIZE
        );
        return;
      } catch {
        // Try another aircraft before showing a recoverable error.
      }
    }

    if (requestId === questionRequestRef.current) {
      setQuestionStatus("error");
      setImageLoadError(
        "We couldn't load an aircraft photo. Check your connection and try again—your timer has not started."
      );
    }
  }

  function resetRun() {
    questionRequestRef.current += 1;
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setFeedback(null);
    setLocked(false);
    setQuestionIndex(0);
    seenIdsRef.current.clear();
    seenPhotosRef.current.clear();
    setCurrent(null);
    setQuestionStatus("idle");
    setImageLoadError("");
    setPersonalRecord(null);
  }

  async function startQuiz() {
    resetRun();
    setScreen("quiz");
    if (warmupPromiseRef.current) await warmupPromiseRef.current;
    await nextQuestion(true);
  }

  // Timer
  const timeLeft = useCountdown(
    questionTimeSec,
    screen === "quiz" && questionStatus === "ready" && !!current && !locked,
    () => {
      if (locked || !current) return;
      // Time out => incorrect
      setLocked(true);
      const fact = current.correct?.fact || "";
      setFeedback({
        correct: false,
        fact,
        correctModel: current.correct?.model || "",
        points: 0,
        selectedId: undefined,
      });
      // mark this id as seen to avoid repeats
      if (current?.correct?.id) seenIdsRef.current.add(current.correct.id);
    },
    current?.questionKey
  );

  function handleAnswer(a: Aircraft) {
    if (!current || locked) return;
    setLocked(true);

    const isCorrect = a.id === current.correct?.id;
    const fact = current.correct?.fact || "";

    let awarded = 0;
    if (isCorrect) {
      const speedBonus = Math.round((timeLeft / questionTimeSec) * 100);
      const streakBonus = streak * 20; // bonus grows with streak
      awarded = 100 + speedBonus + streakBonus;
      setScore((s) => s + awarded);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > bestStreak) setBestStreak(newStreak);
    } else {
      setStreak(0);
    }

    setFeedback({
      correct: isCorrect,
      fact,
      correctModel: current.correct!.model,
      points: awarded,
      selectedId: a.id,
    });
    seenIdsRef.current.add(current.correct!.id);
  }

  async function handleNext() {
    setFeedback(null);
    setLocked(true);
    const nextIdx = questionIndex + 1;
    if (nextIdx >= questionsPerRun) {
      // The browser's existing anonymous profile owns every score automatically.
      setHasCompletedQuiz(true);
      localStorage.setItem(QUIZ_COMPLETED_KEY, "true");
      if (!playerProfile.usernameChosen) setShowUsernameSetup(true);
      setScreen("result");
      void saveLeaderboard();
      return;
    }
    setQuestionIndex(nextIdx);
    setLocked(false);
    await nextQuestion();
  }

  function handleImageRenderError() {
    questionRequestRef.current += 1;
    setLocked(true);
    setCurrent(null);
    setQuestionStatus("error");
    setImageLoadError(
      "The aircraft photo became unavailable. Try loading this question again—no time was deducted."
    );
  }

  async function saveLeaderboard() {
    let profile = playerProfile;
    const previousBest = leaderboard.find(
      (entry) => entry.deviceId === profile.deviceId || entry.name === profile.username
    )?.score || 0;
    const entry = {
      name: profile.username,
      score: Math.max(score, previousBest, playerStats.personalBest),
      date: new Date().toISOString(),
      deviceId: profile.deviceId,
    };
    const updated = [
      ...leaderboard.filter(
        (item) => item.deviceId !== profile.deviceId && item.name !== profile.username
      ),
      entry,
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    setLeaderboard(updated);
    localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(updated));

    const submit = async () => fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: profile.username,
        score,
        bestStreak,
        deviceId: profile.deviceId,
      }),
    });

    try {
      let response = await submit();
      if (response.status === 409) {
        setShowUsernameSetup(true);
        throw new Error("Username is already in use");
      }
      if (!response.ok) throw new Error("Score submission failed");
      const data = await response.json();
      const nextStats: PlayerStats = {
        personalBest: Number(data.personalBest || score),
        bestStreak: Number(data.bestStreak || bestStreak),
        rank: data.rank,
        totalPlayers: Number(data.totalPlayers || 0),
        topPercent: data.topPercent,
      };
      setPlayerStats(nextStats);
      writePlayerStats(nextStats);
      setPlayerStanding({ name: profile.username, score: nextStats.personalBest, date: new Date().toISOString(), deviceId: profile.deviceId, rank: data.rank, totalPlayers: data.totalPlayers, topPercent: data.topPercent });
      if (data.personalRecord) {
        setPersonalRecord({ beaten: true, previousBest: Number(data.previousBest || 0), newBest: nextStats.personalBest, rank: data.rank, totalPlayers: data.totalPlayers, topPercent: data.topPercent });
      }
      if (profile.username !== entry.name) {
        const corrected = updated.map((item) =>
          item.deviceId === profile.deviceId ? { ...item, name: profile.username } : item
        );
        setLeaderboard(corrected);
        localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(corrected));
      }
      await refreshGlobalLeaderboard();
    } catch {
      const localBest = Math.max(playerStats.personalBest, score);
      const localStreak = Math.max(playerStats.bestStreak, bestStreak);
      const localStats = { ...playerStats, personalBest: localBest, bestStreak: localStreak };
      setPlayerStats(localStats);
      writePlayerStats(localStats);
      if ((playerStats.personalBest === 0 && score > 0) || score > playerStats.personalBest) {
        setPersonalRecord({ beaten: true, previousBest: playerStats.personalBest, newBest: score });
      }
      setLeaderboardOnline(false);
    }
  }

  async function updatePlayerUsername(rawName: string) {
    const cleanName = normalizeUsername(rawName);
    if (cleanName.length < 3) {
      return { ok: false, error: "Use at least 3 letters or numbers." };
    }
    if (cleanName === playerProfile.username && playerProfile.usernameChosen) return { ok: true, online: leaderboardOnline };

    const previousName = playerProfile.username;
    const candidate = { ...playerProfile, username: cleanName };
    const persistRenamedProfile = () => {
      const saved = saveAnonymousUsername(cleanName, true);
      setPlayerProfile(saved);
      setShowUsernameSetup(false);
      setLeaderboard((current) => {
        const renamed = current.map((entry) =>
          entry.deviceId === saved.deviceId || entry.name === previousName
            ? { ...entry, name: cleanName, deviceId: saved.deviceId }
            : entry
        );
        localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(renamed));
        return renamed;
      });
      return saved;
    };

    try {
      const response = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: candidate.username,
          score,
          bestStreak,
          deviceId: candidate.deviceId,
        }),
      });
      if (response.status === 409) {
        return { ok: false, error: "That username is already in use." };
      }
      if (!response.ok) throw new Error("Profile update failed");
    } catch {
      persistRenamedProfile();
      setLeaderboardOnline(false);
      return { ok: true, online: false };
    }

    persistRenamedProfile();
    await refreshGlobalLeaderboard();
    return { ok: true, online: true };
  }

  function resetLeaderboard() {
    setLeaderboard([]);
    localStorage.removeItem(LOCAL_LEADERBOARD_KEY);
  }

  return (
    <div
      className={classNames(
        "min-h-screen w-full bg-slate-950 text-slate-100",
        screen === "learn"
          ? "overflow-y-auto"
          : screen === "quiz"
            ? "h-dvh overflow-hidden"
            : "overflow-x-hidden"
      )}
    >
      <TopBar
        onOpenLeaderboard={() => {
          setShowLeaderboard(true);
          void refreshGlobalLeaderboard();
        }}
        score={score}
        streak={streak}
        playerStats={playerStats}
        screen={screen}
      />

      {screen === "menu" && (
        <MenuScreen
          enabledTypes={enabledTypes}
          questionsPerRun={questionsPerRun}
          questionTimeSec={questionTimeSec}
          aircraftCount={filteredDB.length}
          hasCompletedQuiz={hasCompletedQuiz}
          onStart={startQuiz}
          onLearn={() => {
            if (hasCompletedQuiz) setScreen("learn");
          }}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {screen === "quiz" && (
        <QuizScreen
          key={current?.questionKey}
          current={current}
          questionIndex={questionIndex}
          totalQuestions={questionsPerRun}
          timeLeft={timeLeft}
          totalTime={questionTimeSec}
          onAnswer={handleAnswer}
          onNext={handleNext}
          locked={locked}
          feedback={feedback}
          onImageError={handleImageRenderError}
          loading={questionStatus !== "ready"}
          loadError={questionStatus === "error" ? imageLoadError : ""}
          onRetry={() => {
            setLocked(false);
            nextQuestion();
          }}
          onQuit={() => setShowQuitConfirm(true)}
        />
      )}

      {screen === "result" && (
        <ResultScreen
          score={score}
          bestStreak={bestStreak}
          personalRecord={personalRecord}
          onPlayAgain={startQuiz}
          onBackToMenu={() => setScreen("menu")}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
        />
      )}

      {screen === "learn" && (
        <LearnModeScreen
          db={AIRCRAFT_DB}
          enabledTypes={enabledTypes}
          setEnabledTypes={setEnabledTypes}
          onBackToMenu={() => setScreen("menu")}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal
          leaderboard={leaderboard}
          online={leaderboardOnline}
          playerProfile={playerProfile}
          playerStanding={playerStanding}
          onClose={() => setShowLeaderboard(false)}
          onReset={resetLeaderboard}
        />
      )}

      {showSettings && (
        <SettingsModal
          enabledTypes={enabledTypes}
          setEnabledTypes={setEnabledTypes}
          username={playerProfile.username}
          deviceId={playerProfile.deviceId}
          onSaveUsername={updatePlayerUsername}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showUsernameSetup && !showSettings && (
        <UsernameSetupModal
          deviceId={playerProfile.deviceId}
          username={playerProfile.usernameChosen ? playerProfile.username : ""}
          onSaveUsername={updatePlayerUsername}
        />
      )}

      {showQuitConfirm && (
        <ConfirmQuitModal
          onCancel={() => setShowQuitConfirm(false)}
          onConfirm={() => {
            setShowQuitConfirm(false);
            resetRun();
            setCurrent(null);
            setScreen("menu");
          }}
        />
      )}

    </div>
  );
}

// --------------------------
// UI Components
// --------------------------
function TopBar({
  score,
  streak,
  playerStats,
  screen,
  onOpenLeaderboard,
}: {
  score: number;
  streak: number;
  playerStats: PlayerStats;
  screen: string;
  onOpenLeaderboard: () => void;
}) {
  const inQuiz = screen === "quiz";
  const displayScore = inQuiz ? score : (playerStats.personalBest || "—");
  const displayStreak = inQuiz ? streak : (playerStats.bestStreak || "—");
  return (
    <header className={classNames(
      "sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur",
      screen === "quiz" ? "h-14" : "h-16"
    )}>
      <div className="mx-auto flex h-full max-w-[96rem] items-center justify-between px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl shadow-lg shadow-sky-950/40 sm:h-11 sm:w-11">
            <img src="/app-icon.png" alt="Airplane Spotter" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black uppercase tracking-[0.08em] text-white sm:text-xl sm:tracking-[0.12em]">
              Airplane <span className="text-sky-400">Spotter</span>
            </h1>
            <div className="hidden text-xs font-bold uppercase tracking-[0.22em] text-slate-400 sm:block">
              Recognize. Learn. Spot.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm sm:gap-3">
          <div className="hidden items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-2 sm:flex">
            <span className="font-bold text-slate-400">{inQuiz ? "Score" : "Personal Best"}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-amber-300" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9L12 3Z" />
            </svg>
            <span className="font-black text-white">{displayScore}</span>
          </div>
          <div className="hidden items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-2 sm:flex">
            <span className="font-bold text-slate-400">{inQuiz ? "Streak" : "Best Streak"}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-orange-400" fill="currentColor">
              <path d="M13.7 2.4c.4 3.2-1.6 4.8-3.4 6.5-1.6 1.5-3.1 2.9-3.1 5.4A4.8 4.8 0 0 0 12 19.1a4.8 4.8 0 0 0 4.8-4.8c0-1.9-.9-3.4-2.1-4.8-.2 1.7-1.1 2.9-2.4 3.9.5-2.6-.1-4.7-1.9-6.3 2.2-1.1 3.3-2.7 3.3-4.7Z" />
            </svg>
            <span className="font-black text-white">{displayStreak}</span>
          </div>
          <button
            onClick={onOpenLeaderboard}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700/90 bg-slate-900/70 px-3 py-2 text-xs font-black text-white shadow-lg shadow-black/20 transition hover:border-sky-500/60 hover:bg-slate-900 sm:px-4"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M18 3h2a1 1 0 0 1 1 1v2a5 5 0 0 1-4.2 4.9A6 6 0 0 1 13 14.9V18h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-3.1a6 6 0 0 1-3.8-4A5 5 0 0 1 3 6V4a1 1 0 0 1 1-1h2V2h12v1Zm0 2v3.7A3 3 0 0 0 19 6V5h-1ZM5 5v1a3 3 0 0 0 1 2.2V5H5Z" />
            </svg>
            <span className="hidden sm:inline">Leaderboard</span>
          </button>
          <a
            href="https://github.com/nahubn1/airplane-recognition-quiz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View project on GitHub"
            title="View project on GitHub"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800/80 bg-slate-900/30 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900/70 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.66.35-1.12.64-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.97c.85 0 1.7.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.59.69.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}

function StatCard({
  value,
  label,
  tone,
  icon,
  iconImageSrc,
}: {
  value: string | number;
  label: string;
  tone: "blue" | "emerald" | "violet";
  icon: React.ReactNode;
  iconImageSrc?: string;
}) {
  const tones = {
    blue: "bg-blue-600/30 text-blue-300",
    emerald: "bg-emerald-500/25 text-emerald-300",
    violet: "bg-violet-600/30 text-violet-300",
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-sky-800/60 bg-slate-950/55 p-3 shadow-lg shadow-black/20 backdrop-blur sm:gap-4 sm:p-4 xl:p-5">
      <span className={classNames("flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 xl:h-14 xl:w-14", tones[tone])}>
        {iconImageSrc ? (
          <img src={iconImageSrc} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 sm:h-6 sm:w-6 xl:h-7 xl:w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none text-white sm:text-3xl xl:text-4xl">{value}</div>
        <div className="mt-1 break-words text-[0.65rem] font-bold uppercase leading-tight tracking-[0.08em] text-slate-300 sm:mt-2 sm:text-xs sm:tracking-[0.12em]">{label}</div>
      </div>
    </div>
  );
}

function ChecklistItem({
  number,
  title,
  body,
  icon,
  iconImageSrc,
}: {
  number: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  iconImageSrc?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_auto_1fr] items-center gap-3 rounded-2xl border border-sky-900/70 bg-slate-950/55 p-3 xl:gap-4 xl:p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-950/40 xl:h-11 xl:w-11 xl:text-lg">
        {number}
      </span>
      <span className="flex h-9 w-9 items-center justify-center text-blue-400 xl:h-11 xl:w-11">
        {iconImageSrc ? (
          <img src={iconImageSrc} alt="" className="h-8 w-8 rounded-lg object-cover xl:h-10 xl:w-10" />
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6 xl:h-8 xl:w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        )}
      </span>
      <div>
        <div className="text-xs font-black uppercase tracking-wide text-white xl:text-sm">{title}</div>
        <p className="mt-1 text-xs leading-5 text-slate-300 xl:mt-2 xl:text-sm xl:leading-6">{body}</p>
      </div>
    </div>
  );
}

function MenuScreen({
  enabledTypes,
  questionsPerRun,
  questionTimeSec,
  aircraftCount,
  hasCompletedQuiz,
  onStart,
  onLearn,
  onOpenSettings,
}: any) {
  const activeTypes = TYPES.filter((t) => enabledTypes[t]);
  const canStart = aircraftCount >= OPTIONS_PER_QUESTION;
  const [learnHint, setLearnHint] = useState(false);

  return (
    <main className="menu-screen mx-auto max-w-[96rem] px-3 py-3 sm:px-5 sm:py-5 xl:min-h-[calc(100dvh-4rem)]">
      <section className="rounded-[1.5rem] border border-sky-900/60 bg-slate-950/80 p-3 shadow-2xl shadow-black/40 sm:rounded-[2rem] xl:min-h-[calc(100dvh-6rem)] xl:p-4">
        <div className="grid gap-4 xl:grid-cols-[1.5fr_0.95fr] xl:gap-5">
          <div
            className="relative overflow-hidden rounded-3xl border border-sky-800/60 bg-slate-900 p-4 shadow-2xl shadow-sky-950/20 sm:p-6 xl:min-h-[calc(100dvh-8rem)] xl:p-8"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(2,6,23,0.98) 0%, rgba(2,6,23,0.86) 42%, rgba(2,6,23,0.26) 100%), linear-gradient(0deg, rgba(2,6,23,0.9), rgba(2,6,23,0.08) 54%), url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1600&q=80')",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <div className="relative z-10 flex min-h-[34rem] flex-col justify-between gap-8 sm:min-h-[38rem] xl:min-h-[calc(100dvh-12rem)] xl:gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-blue-600/20 px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-sky-200 sm:mb-5 sm:px-4 sm:py-2 sm:text-xs xl:mb-7">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/70 sm:h-8 sm:w-8">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-white sm:h-5 sm:w-5" fill="currentColor">
                      <path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2Z" />
                    </svg>
                  </span>
                  Aircraft recognition quiz
                </div>
                <h2 className="max-w-[42rem] text-3xl font-black leading-[1.04] tracking-tight text-white drop-shadow-lg sm:text-5xl xl:text-6xl">
                  Identify the <span className="text-blue-400">aircraft</span>{" "}
                  before the timer runs out.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-300 sm:mt-5 sm:text-base sm:leading-7 xl:mt-6 xl:text-lg xl:leading-8">
                  A fast and fun quiz to test your knowledge of aircraft
                  silhouettes, engines, tails, and more.
                </p>
              </div>

              <div>
                <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-3 sm:gap-3 xl:gap-4">
                  <StatCard
                    value={questionsPerRun}
                    label="Questions"
                    tone="blue"
                    icon={
                      <path d="M7 3h10a2 2 0 0 1 2 2v14l-4-2-3 2-3-2-4 2V5a2 2 0 0 1 2-2Zm2 5h6M9 12h6" />
                    }
                  />
                  <StatCard
                    value={`${questionTimeSec}s`}
                    label="Per question"
                    tone="emerald"
                    icon={
                      <>
                        <path d="M12 7v5l3 2" />
                        <path d="M9 2h6" />
                        <path d="M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
                      </>
                    }
                  />
                  <StatCard
                    value="100+"
                    label="Aircraft pool"
                    tone="violet"
                    icon={null}
                    iconImageSrc="/app-icon.png"
                  />
                </div>

                <div className="mt-3 border-t border-sky-900/50 pt-3 sm:mt-5 sm:pt-5 xl:mt-8 xl:pt-8">
                  <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-[1fr_1fr_auto] sm:gap-3 xl:gap-4">
                    <button
                      onClick={onStart}
                      disabled={!canStart}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-black text-white shadow-xl shadow-blue-950/40 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 sm:min-h-14 sm:text-base xl:min-h-[4.4rem] xl:gap-3 xl:px-7 xl:text-lg"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 xl:h-6 xl:w-6" fill="currentColor">
                        <path d="M8 5v14l11-7L8 5Z" />
                      </svg>
                      Start Quiz
                    </button>
                    <button
                      onClick={() => {
                        if (hasCompletedQuiz) {
                          onLearn();
                        } else {
                          setLearnHint(true);
                        }
                      }}
                      onMouseEnter={() => !hasCompletedQuiz && setLearnHint(true)}
                      onFocus={() => !hasCompletedQuiz && setLearnHint(true)}
                      onMouseLeave={() => setLearnHint(false)}
                      onBlur={() => setLearnHint(false)}
                      aria-describedby={!hasCompletedQuiz ? "learn-mode-hint" : undefined}
                      className={classNames(
                        "relative inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-black transition sm:min-h-14 sm:text-base xl:min-h-[4.4rem] xl:gap-3 xl:px-7 xl:text-lg",
                        hasCompletedQuiz
                          ? "border-sky-800/80 bg-slate-950/60 text-slate-100 hover:border-blue-500/70 hover:bg-slate-900"
                          : "border-slate-700/80 bg-slate-950/50 text-slate-500 hover:border-blue-500/40"
                      )}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="hidden h-5 w-5 text-blue-400 sm:block xl:h-6 xl:w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" />
                      </svg>
                      <span className="hidden sm:inline">Learn Mode</span>
                      <span className="sm:hidden">Learn</span>
                      {!hasCompletedQuiz && learnHint && (
                        <span
                          id="learn-mode-hint"
                          className="absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium leading-5 text-slate-200 shadow-xl shadow-black/30"
                        >
                          Play one quiz to unlock.
                        </span>
                      )}
                    </button>
                    <button
                      onClick={onOpenSettings}
                      aria-label="Open settings"
                      title="Settings"
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-sky-800/80 bg-slate-950/60 py-3 text-slate-100 transition hover:border-blue-500/70 hover:bg-slate-900 min-[520px]:w-12 sm:min-h-14 sm:w-14 xl:min-h-[4.4rem] xl:w-[4.4rem]"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-5 w-5 xl:h-6 xl:w-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.38.55.7 1 .9.23.1.47.15.72.15H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.95Z" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-3 hidden gap-4 border-t border-sky-900/40 pt-4 text-sm font-bold text-slate-300 md:grid md:grid-cols-3 xl:mt-7 xl:pt-6">
                    <div className="flex items-center gap-3">
                      <span className="text-blue-400">Quick rounds</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-blue-400">Learn as you play</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-blue-400">Track your progress</span>
                    </div>
                  </div>

                  {!canStart && (
                    <p className="mt-4 text-sm text-rose-300">
                      Select at least four aircraft in Settings to start a quiz.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden space-y-4 xl:block xl:space-y-5">
            <div className="flex min-h-[calc(100dvh-8rem)] flex-col justify-between">
              <div>
                <div className="rounded-3xl border border-sky-800/60 bg-slate-900/75 p-6 shadow-xl shadow-sky-950/20">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400">
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 11h6M9 15h6M9 7h2" />
                          <path d="M7 3h10a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
                        </svg>
                      </span>
                      <div>
                        <h3 className="text-xl font-black text-white">Spotting checklist</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Scan the image in this order before you answer.
                      </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <ChecklistItem
                      number="01"
                      title="Silhouette"
                      body="Wing sweep, fuselage length, nose shape, and tail style."
                      icon={null}
                      iconImageSrc="/app-icon.png"
                    />
                    <ChecklistItem
                      number="02"
                      title="Engines"
                      body="Count them, then check whether they sit underwing, rear, or on pylons."
                      icon={<><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 5v14M5 12h14M7.1 7.1l9.8 9.8M16.9 7.1l-9.8 9.8" /></>}
                    />
                    <ChecklistItem
                      number="03"
                      title="Details"
                      body="Look for winglets, landing gear stance, canopy, props, and deck shape."
                      icon={<><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19 12h3M2 12h3M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-3xl border border-sky-800/60 bg-slate-900/75 p-6 shadow-xl shadow-sky-950/20">
                  <div className="flex items-center gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
                        <path d="M12 2 14 9l7 3-7 3-2 7-2-7-7-3 7-3 2-7Z" />
                      </svg>
                    </span>
                    <div>
                      <h3 className="text-xl font-black text-white">Aircraft types</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Adjust the aircraft pool from Settings.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {activeTypes.map((t) => (
                      <span
                        key={t}
                        className="rounded-xl border border-sky-500/40 bg-blue-600/20 px-4 py-3 text-center text-sm font-black capitalize text-sky-100"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-sky-800/60 bg-[linear-gradient(135deg,rgba(6,182,212,0.18),rgba(15,23,42,0.65))] p-6 shadow-xl shadow-sky-950/20">
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18h6M10 22h4" />
                      <path d="M8.5 14.5A6 6 0 1 1 15.5 14c-.8.7-1.5 1.5-1.5 2.5h-4c0-.9-.6-1.6-1.5-2Z" />
                    </svg>
                  </span>
                  <div className="text-xl font-black text-white">Spotter tip</div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Start with wing shape, engine count, and tail layout. Model
                  details get easier once the big silhouette is familiar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function QuestionLoadingScreen({ status, message, onRetry, onQuit }: any) {
  const failed = status === "error";
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4">
      <div className="text-center">
        {!failed ? (
          <>
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" aria-hidden="true" />
            <p className="mt-3 text-sm text-slate-400">Loading image…</p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300">Photo unavailable</p>
            <p className="mt-1 text-xs text-slate-500">{message}</p>
          </>
        )}
        <div className="mt-4 flex items-center justify-center gap-2">
          {failed && (
            <button onClick={onRetry} className="text-sm text-sky-400 hover:text-sky-300">
              Retry
            </button>
          )}
          <button onClick={onQuit} className="text-sm text-slate-500 hover:text-slate-300">
            Quit
          </button>
        </div>
      </div>
    </main>
  );
}

function QuizScreen({
  current,
  questionIndex,
  totalQuestions,
  timeLeft,
  totalTime,
  onAnswer,
  onNext,
  onQuit,
  locked,
  feedback,
  onImageError,
  loading,
  loadError,
  onRetry,
}: any) {
  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / totalTime) * 100)));

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col overflow-hidden px-3 py-2 sm:px-5 sm:py-3 lg:px-8 lg:py-2">
      {/* Progress */}
      <div className="mb-2 shrink-0 rounded-xl border border-sky-900/70 bg-slate-900/55 p-2.5 sm:mb-3 sm:rounded-2xl sm:p-3 lg:grid lg:grid-cols-[10rem_1fr_9rem] lg:items-center lg:gap-6 lg:px-5 lg:py-2">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-300 lg:mb-0">
          <span className="sm:text-sm">
            <span className="hidden text-slate-500 sm:inline">Question </span>{questionIndex + 1} <span className="text-slate-500">/ {totalQuestions}</span>
          </span>
          <div className="flex items-center gap-2 lg:hidden">
            <span className="font-bold text-white">{Math.ceil(timeLeft)}s</span>
            <button
              onClick={onQuit}
              aria-label="Quit quiz"
              title="Quit quiz"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/70 text-slate-300 hover:border-rose-500/50 hover:text-rose-200"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 7 5 12l5 5" />
                <path d="M5 12h12" />
                <path d="M14 4h5v16h-5" />
              </svg>
            </button>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800 sm:h-2.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="hidden items-center justify-end gap-3 lg:flex">
          <span className="text-2xl font-black text-white">{Math.ceil(timeLeft)}s</span>
          <button onClick={onQuit} aria-label="Quit quiz" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/70 text-slate-300 hover:text-rose-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 7 5 12l5 5"/><path d="M5 12h12"/><path d="M14 4h5v16h-5"/></svg>
          </button>
        </div>
      </div>

      {/* Photo */}
      <div className="relative min-h-[7rem] w-full flex-1 overflow-hidden rounded-2xl border border-sky-900/70 bg-slate-900 shadow-2xl shadow-black/30 lg:rounded-3xl">
        {current?.imageUrl && !loading ? (
          <>
            <img
              src={current.imageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-[1.15] object-cover opacity-90 blur-lg"
            />
            <img
              src={current.imageUrl}
              alt={current.correct?.model}
              onError={onImageError}
              className={classNames(
                "aircraft-image-foreground relative z-[1] h-full w-full object-contain transition-opacity duration-500",
                locked ? "opacity-80" : "opacity-100"
              )}
            />
          </>
        ) : loadError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900 text-center">
            <span className="text-sm text-slate-400">Photo unavailable</span>
            <button onClick={onRetry} className="text-sm text-sky-400 hover:text-sky-300">Retry</button>
          </div>
        ) : (
          <div className="aircraft-image-skeleton h-full w-full" aria-label="Loading aircraft image" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(transparent,rgba(2,6,23,0.6))]" />
      </div>

      {/* Options */}
      <div className="mt-2 grid shrink-0 grid-cols-1 gap-1.5 sm:mt-3 sm:gap-2 lg:mt-2 lg:gap-1.5">
        {(current?.options || []).map((a: Aircraft, index: number) => {
          const isCorrectAnswer = locked && current?.correct && a.id === current.correct.id;
          const isWrongSelection = locked && feedback?.selectedId === a.id && !isCorrectAnswer;
          return (
          <button
            key={a.id}
            disabled={locked || loading}
            onClick={() => onAnswer(a)}
            className={classNames(
              "group flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-bold transition sm:min-h-12 sm:rounded-2xl sm:px-5 sm:py-2.5 sm:text-base lg:min-h-10 lg:py-1.5",
              "border-slate-700/80 bg-slate-900/80 hover:border-sky-500/60 hover:bg-slate-800/90 disabled:cursor-default",
              isCorrectAnswer && "border-emerald-500 bg-emerald-500/10 text-emerald-50",
              isWrongSelection && "border-rose-500 bg-rose-500/10 text-rose-50"
            )}
          >
            <span className={classNames(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky-500/80 text-xs font-black text-sky-400 sm:h-9 sm:w-9 sm:text-sm",
              isCorrectAnswer && "border-emerald-400 bg-emerald-500 text-white",
              isWrongSelection && "border-rose-400 bg-rose-500 text-white"
            )}>{String.fromCharCode(65 + index)}</span>
            <span className="min-w-0 flex-1">{a.model}</span>
            {isCorrectAnswer && <span className="text-lg text-emerald-400" aria-label="Correct">✓</span>}
            {isWrongSelection && <span className="text-lg text-rose-400" aria-label="Incorrect">×</span>}
          </button>
        )})}
      </div>

      {/* Feedback */}
      {feedback && !feedback.correct && (
        <div
          className={classNames(
            "mt-2 shrink-0 rounded-2xl border p-3 sm:mt-3 sm:p-4 lg:mt-2 lg:p-3",
            "border-rose-500/60 bg-rose-950/30 shadow-lg shadow-rose-950/20"
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-black text-rose-400">Incorrect</div>
              <div className="mt-1 text-sm text-slate-200">
                Answer: <span className="font-bold text-sky-400">{feedback.correctModel}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-300 sm:text-sm sm:leading-5">{feedback.fact}</p>
            </div>
            <div>
              <button
                onClick={onNext}
                className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-400 sm:px-6"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && feedback.correct && (
        <div className="mt-2 flex shrink-0 items-center justify-between rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-3 sm:mt-3 sm:p-4 lg:mt-2 lg:p-3">
          <div className="text-sm font-semibold">
            Correct!
            <span className="ml-2 text-slate-300">
              {"+" + feedback.points + " pts"}
            </span>
          </div>
          <button
            onClick={onNext}
            className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-400"
          >
            Next
          </button>
        </div>
      )}

    </main>
  );
}

function ResultScreen({ score, bestStreak, personalRecord, onPlayAgain, onBackToMenu, onOpenLeaderboard }: any) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl items-center justify-center px-4 py-4">
      <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center sm:p-8">
        <h2 className="text-2xl font-bold sm:text-3xl">Flight complete</h2>
        <p className="mt-2 text-slate-300">Final score</p>
        <div className="mt-2 text-5xl font-extrabold text-sky-400 sm:text-6xl">{score}</div>
        <div className="mt-3 text-sm text-slate-300">Best streak: {bestStreak} in a row</div>
        {personalRecord?.beaten && (
          <div className="record-celebration relative mt-6 overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-300/15 via-sky-500/10 to-violet-500/15 p-5 text-left shadow-[0_0_45px_rgba(56,189,248,0.2)]">
            <div className="record-shimmer" />
            <span className="record-particle left-[12%] top-3" /><span className="record-particle left-[72%] top-5" /><span className="record-particle left-[88%] top-16" />
            <div className="relative"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Personal record</p><p className="mt-1 text-xl font-black text-white">{personalRecord.previousBest === 0 ? "Your first personal best." : "You just beat your best."}</p><p className="mt-2 text-sm text-slate-300">{personalRecord.previousBest === 0 ? <><span className="font-black text-sky-300">{personalRecord.newBest}</span> points</> : <>{personalRecord.previousBest} <span className="text-slate-500">→</span> <span className="font-black text-sky-300">{personalRecord.newBest}</span></>}</p>{personalRecord.rank && personalRecord.totalPlayers ? <p className="mt-2 text-sm font-semibold text-emerald-300">#{personalRecord.rank} of {personalRecord.totalPlayers} · Top {personalRecord.topPercent}% worldwide</p> : <p className="mt-2 text-xs text-slate-400">Your global placement will update when you’re online.</p>}</div>
            <button onClick={onOpenLeaderboard} className="relative mt-4 rounded-lg border border-sky-400/40 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-400/10">View leaderboard</button>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onPlayAgain}
            className="rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950 hover:bg-sky-400"
          >
            Play again
          </button>
          <button
            onClick={onBackToMenu}
            className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-3 font-semibold hover:border-slate-700"
          >
            Back to menu
          </button>
        </div>
      </div>
    </main>
  );
}

function UsernameEditor({ deviceId, initialName, onSave, compact = false, alwaysEditing = false }: any) {
  const [draftName, setDraftName] = useState(initialName || "");
  const [editing, setEditing] = useState(alwaysEditing);
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "offline">("idle");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraftName(initialName || ""), [initialName]);
  useEffect(() => {
    if (!editing) return;
    const clean = normalizeUsername(draftName);
    if (clean.length < 3 || clean !== draftName.trim()) {
      setAvailability(draftName ? "invalid" : "idle");
      setMessage(draftName ? "Use 3–24 letters, numbers, _ or -." : "");
      return;
    }
    setAvailability("checking");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: clean, deviceId }), signal: controller.signal });
        const data = await response.json();
        setAvailability(data.available ? "available" : "taken");
        setMessage(data.available ? "Available" : "That name is already taken.");
      } catch {
        if (!controller.signal.aborted) { setAvailability("offline"); setMessage("Can’t check right now; you can still save on this device."); }
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [draftName, deviceId, editing]);

  async function submit() {
    const clean = normalizeUsername(draftName);
    if (clean.length < 3 || availability === "taken" || availability === "invalid" || availability === "checking") return;
    setSaving(true);
    const result = await onSave(clean);
    setSaving(false);
    if (result.ok) {
      setMessage(result.online === false ? "Saved on this device." : "Username saved.");
      if (!alwaysEditing) setEditing(false);
    }
    else { setAvailability("taken"); setMessage(result.error || "That name is unavailable."); }
  }

  if (!editing) return <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
    <span className="truncate text-sm font-semibold text-white">{initialName || "Username"}</span>
    <button type="button" onClick={() => { setEditing(true); setMessage(""); }} aria-label="Edit username" title="Edit username" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:border-sky-500 hover:text-sky-300">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 16 9.5-9.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /><path d="m13.5 6.5 4 4" /></svg>
    </button>
  </div>;

  return <div className={classNames("flex flex-col gap-2", compact ? "" : "sm:flex-row")}>
    <div className="min-w-0 flex-1">
      <input value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={24} placeholder="Username" aria-label="Player username" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-sky-500" />
      {message && <p className={classNames("mt-1 text-xs", availability === "available" && "text-emerald-400", availability === "taken" && "text-rose-400", availability === "offline" && "text-amber-400", availability === "invalid" && "text-rose-400", availability === "checking" && "text-slate-400")}>{availability === "checking" ? "Checking availability…" : message}</p>}
    </div>
    <div className="flex gap-2">
      <button type="button" onClick={() => { setDraftName(generateCallsign()); setMessage(""); }} aria-label="Suggest a username" title="Suggest a username" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-sky-300 hover:border-sky-500">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></svg>
      </button>
      <button type="button" onClick={submit} disabled={saving || availability === "checking" || availability === "taken" || availability === "invalid" || !draftName} aria-label="Save username" title="Save username" className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
      </button>
    </div>
  </div>;
}

function UsernameSetupModal({ deviceId, username, onSaveUsername }: any) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
    <div className="w-full max-w-md rounded-2xl border border-sky-800/70 bg-slate-900 p-6 shadow-2xl shadow-black/50">
      <div className="mb-5"><h3 className="text-lg font-bold text-white">Leaderboard name</h3><p className="mt-1 text-sm text-slate-400">Pick a name to appear on the leaderboard.</p></div>
      <UsernameEditor deviceId={deviceId} initialName={username} onSave={onSaveUsername} alwaysEditing />
    </div>
  </div>;
}

function SettingsModal({
  enabledTypes,
  setEnabledTypes,
  username,
  deviceId,
  onSaveUsername,
  onClose,
}: any) {
  const selectedCount = TYPES.filter((t) => enabledTypes[t]).length;

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Settings</h3>
            <p className="mt-1 text-sm text-slate-400">
              Manage your player profile and aircraft pool.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-sky-800/60 bg-slate-950/70 p-4">
          <div className="font-semibold text-white">Player username</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            This name belongs to this browser and is reused automatically after every quiz.
            Use 3–24 letters, numbers, underscores, or hyphens.
          </p>
          <div className="mt-3"><UsernameEditor deviceId={deviceId} initialName={username} onSave={onSaveUsername} /></div>
        </div>

        <div className="mb-3 text-sm font-semibold text-white">Aircraft types</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TYPES.map((t) => (
            <label
              key={t}
              className={classNames(
                "flex cursor-pointer items-center justify-between rounded-xl border p-4 text-sm transition",
                enabledTypes[t]
                  ? "border-sky-500/40 bg-sky-500/10"
                  : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
              )}
            >
              <span className="font-semibold capitalize">{t}</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-400"
                checked={enabledTypes[t]}
                onChange={(e) =>
                  setEnabledTypes((s: Record<string, boolean>) => ({
                    ...s,
                    [t]: e.target.checked,
                  }))
                }
              />
            </label>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          <div className="font-semibold text-white">Round format</div>
          <p className="mt-1 text-slate-400">
            10 questions, 15 seconds each, 4 choices per question.
          </p>
          {selectedCount === 0 && (
            <p className="mt-3 text-rose-300">
              Select at least one type to build an aircraft pool.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmQuitModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Quit this quiz?</h3>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Your current round progress will be lost.
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-400"
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaderboardModal({ leaderboard, online, playerProfile, playerStanding, onClose, onReset }: any) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Global leaderboard</h3>
            <p className={classNames("mt-0.5 text-xs", online ? "text-emerald-400" : "text-amber-400")}>
              {online ? "Live worldwide scores" : "Offline — showing scores saved on this device"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-slate-300">No scores yet. Play a round!</p>
        ) : (
          <ol className="space-y-2">
            {leaderboard.map((e: any, i: number) => {
              const isYou = e.deviceId === playerProfile.deviceId || e.name === playerProfile.username;
              return (
              <li
                key={i}
                className={classNames("flex items-center justify-between rounded-lg border px-3 py-2", isYou ? "border-sky-400/80 bg-sky-500/10 shadow-[0_0_18px_rgba(14,165,233,0.16)]" : "border-slate-800 bg-slate-950")}
              >
                <span className="text-sm">
                  <span className="mr-2 rounded bg-slate-800 px-2 py-0.5 text-xs">#{i + 1}</span>
                  {e.name}
                </span>
                <span className="text-sm font-semibold text-sky-400">{e.score}</span>
              </li>
              );
            })}
          </ol>
        )}
        {online && playerStanding && !leaderboard.some((e: any) => e.deviceId === playerProfile.deviceId || e.name === playerProfile.username) && (
          <div className="mt-4 border-t border-slate-800 pt-4"><p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Your position</p><div className="flex items-center justify-between rounded-lg border border-sky-400/80 bg-sky-500/10 px-3 py-2"><span className="text-sm"><span className="mr-2 rounded bg-slate-800 px-2 py-0.5 text-xs">#{playerStanding.rank}</span>{playerStanding.name}</span><span className="text-sm font-semibold text-sky-400">{playerStanding.score}</span></div></div>
        )}
        <div className="mt-4 text-right">
          <button
            onClick={onReset}
            className="text-xs text-slate-400 underline decoration-dotted underline-offset-4 hover:text-slate-200"
          >
            Clear offline scores
          </button>
        </div>
      </div>
    </div>
  );
}

function LearnModeScreen({ db, enabledTypes, setEnabledTypes, onBackToMenu }: any) {
  const [q, setQ] = useState("");
  const enabled = new Set(
    TYPES.filter((t) => enabledTypes[t]).map((t) => t as string)
  );
  const list = useMemo(() => {
    return db.filter(
      (a: Aircraft) =>
        enabled.has(a.type) &&
        (a.model.toLowerCase().includes(q.toLowerCase()) ||
          a.specs.role.toLowerCase().includes(q.toLowerCase()))
    );
  }, [db, q, enabledTypes]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToMenu}
            aria-label="Back to menu"
            title="Back to menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-100 hover:border-sky-500/50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18 9 12l6-6" />
            </svg>
          </button>
          <h2 className="text-xl font-semibold">Learn mode</h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {TYPES.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1"
            >
              <input
                type="checkbox"
                className="accent-sky-500"
                checked={enabledTypes[t]}
                onChange={(e) =>
                  setEnabledTypes((s: any) => ({ ...s, [t]: e.target.checked }))
                }
              />
              <span className="capitalize">{t}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search models or roles..."
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-sky-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a: Aircraft) => (
          <LearnCard key={a.id} a={a} />
        ))}
      </div>
    </main>
  );
}

function LearnCard({ a }: { a: Aircraft }) {
  const [img, setImg] = useState<string | null>(null);
  const mounted = useRef(false);
  const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
    (a.wikiTitle || a.model).replaceAll(" ", "_")
  )}`;

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const url = await fetchImageForAircraft(a);
      if (mounted.current) setImg(url);
    })();
    return () => {
      mounted.current = false;
    };
  }, [a.id]);

  return (
    <div className="flex overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex w-full flex-col">
      <div className="relative aspect-video w-full">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={a.model} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            Loading...
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2 rounded bg-slate-950/70 px-2 py-1 text-xs capitalize text-slate-200 ring-1 ring-slate-800">
          {a.type}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-sm font-semibold">{a.model}</div>
        <div className="mt-1 text-xs text-slate-300">{a.specs.role}</div>
        <p className="mt-2 text-sm text-slate-300">{a.fact}</p>
        <a
          href={wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-sky-400 hover:text-sky-300"
        >
          Read more on Wikipedia
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      </div>
    </div>
  );
}

// --------------------------
// Dev sanity tests (lightweight, non-blocking)
// --------------------------
(function devTests() {
  try {
    const arr = [1, 2, 3, 4];
    const sh = shuffle(arr);
    console.assert(sh.length === arr.length, "shuffle preserves length");
    console.assert(new Set(sh).size === arr.length, "shuffle preserves items");
    console.assert(
      ["commercial", "military", "vintage", "general"].every((t) =>
        TYPES.includes(t as any)
      ),
      "TYPES contains all categories"
    );
    console.assert(
      AIRCRAFT_DB.length >= 12,
      "DB has a reasonable number of entries"
    );

    // New tests: exactly 4 options logic and fixed 15s timer
    const correct = AIRCRAFT_DB[0];
    const distractors = shuffle(
      AIRCRAFT_DB.filter((a) => a.id !== correct.id)
    ).slice(0, OPTIONS_PER_QUESTION - 1);
    const opts = shuffle([correct, ...distractors]);
    console.assert(
      opts.length === OPTIONS_PER_QUESTION,
      "Exactly 4 options are produced"
    );
    console.assert(
      new Set(opts.map((o) => o.id)).size === OPTIONS_PER_QUESTION,
      "Options are unique"
    );
    console.assert(
      QUIZ_DEFAULTS.questionTimeSec === 15,
      "Timer is fixed at 15 seconds"
    );
  } catch (e) {
    // no-op in production
  }
})();


