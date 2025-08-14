import React, { useEffect, useMemo, useRef, useState } from "react";

// ==========================
// Airplane Recognition Quiz
// ==========================
// Single-file React app implementing:
// - Random aircraft photo (Wikipedia API by default, with graceful fallback)
// - Exactly 4 multiple-choice options (per user request)
// - Immediate feedback with a short fact (wrong answers show a card)
// - Timer fixed to 15s, speed/accuracy scoring, streak + bonus
// - Local leaderboard (localStorage)
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

async function fetchWikipediaImage(model: string): Promise<string | null> {
  const cacheKey = `wikiimg:${model}`;
  if (wikiCache[cacheKey]) return wikiCache[cacheKey];
  const ls = localStorage.getItem(cacheKey);
  if (ls) {
    wikiCache[cacheKey] = ls;
    return ls;
  }

  const tryTitles = [model, `${model} (aircraft)`, model.replaceAll("-", " ")];
  for (const t of tryTitles) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original|thumbnail&pithumbsize=1600&titles=${encodeURIComponent(
        t
      )}&origin=*`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages || {};
      for (const k of Object.keys(pages)) {
        const p = pages[k];
        const src = p?.original?.source || p?.thumbnail?.source;
        if (src) {
          wikiCache[cacheKey] = src;
          localStorage.setItem(cacheKey, src);
          return src;
        }
      }
    } catch (e) {
      // ignore and try next title
    }
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
// Data (concise, illustrative)
// --------------------------
export type Aircraft = {
  id: string;
  model: string;
  type: "commercial" | "military" | "vintage" | "general";
  wikiTitle?: string; // optional title override for Wikipedia
  fact: string;
  specs: {
    role: string;
    firstFlight?: string;
    engines?: string;
  };
};

const AIRCRAFT_DB: Aircraft[] = [
  // Commercial
  {
    id: "b738",
    model: "Boeing 737-800",
    type: "commercial",
    wikiTitle: "Boeing 737 Next Generation",
    fact: "A best‑selling narrow‑body widely used for short to medium‑haul routes.",
    specs: { role: "Narrow‑body airliner", engines: "2 × CFM56" },
  },
  {
    id: "b38m",
    model: "Boeing 737 MAX 8",
    type: "commercial",
    wikiTitle: "Boeing 737 MAX",
    fact: "Re‑engined 737 variant with high‑bypass LEAP-1B engines.",
    specs: { role: "Narrow‑body airliner", engines: "2 × LEAP‑1B" },
  },
  {
    id: "b744",
    model: "Boeing 747-400",
    type: "commercial",
    wikiTitle: "Boeing 747-400",
    fact: "The iconic ‘Queen of the Skies’ with a distinctive upper deck.",
    specs: { role: "Wide‑body airliner", engines: "4 × turbofan" },
  },
  {
    id: "b77w",
    model: "Boeing 777-300ER",
    type: "commercial",
    wikiTitle: "Boeing 777",
    fact: "Long‑range twinjet known for efficiency and ETOPS prowess.",
    specs: { role: "Wide‑body airliner", engines: "2 × GE90‑115B" },
  },
  {
    id: "b789",
    model: "Boeing 787-9",
    type: "commercial",
    wikiTitle: "Boeing 787 Dreamliner",
    fact: "Composite‑rich Dreamliner with excellent range and cabin comfort.",
    specs: { role: "Wide‑body airliner", engines: "2 × Trent 1000/GE NX" },
  },
  {
    id: "a20n",
    model: "Airbus A320neo",
    type: "commercial",
    wikiTitle: "Airbus A320neo family",
    fact: "New engine option offering lower fuel burn and noise.",
    specs: { role: "Narrow‑body airliner", engines: "2 × LEAP‑1A/PW1100G" },
  },
  {
    id: "a21n",
    model: "Airbus A321neo",
    type: "commercial",
    wikiTitle: "Airbus A321neo",
    fact: "Stretched A320 family member popular for high‑density routes.",
    specs: { role: "Narrow‑body airliner", engines: "2 × LEAP‑1A/PW1100G" },
  },
  {
    id: "a339",
    model: "Airbus A330‑900neo",
    type: "commercial",
    wikiTitle: "Airbus A330neo",
    fact: "Modernized A330 with new wings and Rolls‑Royce Trent 7000 engines.",
    specs: { role: "Wide‑body airliner", engines: "2 × Trent 7000" },
  },
  {
    id: "a359",
    model: "Airbus A350‑900",
    type: "commercial",
    wikiTitle: "Airbus A350",
    fact: "Advanced composite twinjet with ultra‑long‑range variants.",
    specs: { role: "Wide‑body airliner", engines: "2 × Trent XWB" },
  },
  {
    id: "a388",
    model: "Airbus A380‑800",
    type: "commercial",
    wikiTitle: "Airbus A380",
    fact: "The world’s largest passenger airliner with two full‑length decks.",
    specs: { role: "Very large airliner", engines: "4 × turbofan" },
  },
  {
    id: "e190e2",
    model: "Embraer E190‑E2",
    type: "commercial",
    wikiTitle: "Embraer E-Jet E2 family",
    fact: "Second‑generation E‑Jet optimized for regional efficiency.",
    specs: { role: "Regional jet", engines: "2 × PW1900G" },
  },
  {
    id: "atr726",
    model: "ATR 72‑600",
    type: "commercial",
    wikiTitle: "ATR 72",
    fact: "Popular turboprop for short‑haul regional routes.",
    specs: { role: "Regional turboprop", engines: "2 × PW127" },
  },

  // Military
  {
    id: "f16",
    model: "F‑16 Fighting Falcon",
    type: "military",
    wikiTitle: "General Dynamics F-16 Fighting Falcon",
    fact: "Agile multirole fighter famed for its bubble canopy and fly‑by‑wire.",
    specs: { role: "Multirole fighter", engines: "1 × turbofan" },
  },
  {
    id: "f22",
    model: "F‑22 Raptor",
    type: "military",
    wikiTitle: "Lockheed Martin F-22 Raptor",
    fact: "Stealth air‑superiority fighter with supercruise capability.",
    specs: { role: "Stealth fighter", engines: "2 × turbofan" },
  },
  {
    id: "f35",
    model: "F‑35A Lightning II",
    type: "military",
    wikiTitle: "Lockheed Martin F-35 Lightning II",
    fact: "Fifth‑gen stealth fighter with advanced sensor fusion.",
    specs: { role: "Stealth multirole", engines: "1 × F135" },
  },
  {
    id: "b2",
    model: "B‑2 Spirit",
    type: "military",
    wikiTitle: "Northrop Grumman B-2 Spirit",
    fact: "Flying‑wing stealth bomber designed for penetrating air defenses.",
    specs: { role: "Stealth bomber", engines: "4 × turbofan" },
  },
  {
    id: "c130j",
    model: "C‑130J Super Hercules",
    type: "military",
    wikiTitle: "Lockheed Martin C-130J Super Hercules",
    fact: "Tactical airlifter renowned for short and rough‑field performance.",
    specs: { role: "Tactical transport", engines: "4 × turboprop" },
  },
  {
    id: "typhoon",
    model: "Eurofighter Typhoon",
    type: "military",
    wikiTitle: "Eurofighter Typhoon",
    fact: "Delta‑canard multirole fighter developed by a European consortium.",
    specs: { role: "Multirole fighter", engines: "2 × turbofan" },
  },
  {
    id: "rafale",
    model: "Dassault Rafale",
    type: "military",
    wikiTitle: "Dassault Rafale",
    fact: "Carrier‑capable multirole fighter with high agility and payload.",
    specs: { role: "Multirole fighter", engines: "2 × turbofan" },
  },

  // Vintage
  {
    id: "dc3",
    model: "Douglas DC‑3",
    type: "vintage",
    wikiTitle: "Douglas DC-3",
    fact: "Revolutionized air transport in the 1930s and 40s.",
    specs: { role: "Piston airliner", engines: "2 × radial" },
  },
  {
    id: "constellation",
    model: "Lockheed Constellation",
    type: "vintage",
    wikiTitle: "Lockheed Constellation",
    fact: "Elegant triple‑tail piston airliner of the golden age.",
    specs: { role: "Piston airliner", engines: "4 × radial" },
  },
  {
    id: "707",
    model: "Boeing 707",
    type: "vintage",
    wikiTitle: "Boeing 707",
    fact: "Early successful jet airliner that popularized intercontinental jet travel.",
    specs: { role: "Jet airliner", engines: "4 × turbojet/turbofan" },
  },
  {
    id: "comet",
    model: "de Havilland Comet",
    type: "vintage",
    wikiTitle: "de Havilland Comet",
    fact: "World’s first commercial jet airliner (lessons reshaped fatigue design).",
    specs: { role: "Jet airliner", engines: "4 × turbojet" },
  },
  {
    id: "concorde",
    model: "Concorde",
    type: "vintage",
    wikiTitle: "Concorde",
    fact: "Supersonic airliner cruising at Mach 2 with a droop nose.",
    specs: { role: "Supersonic airliner", engines: "4 × Olympus" },
  },
  {
    id: "spitfire",
    model: "Supermarine Spitfire",
    type: "vintage",
    wikiTitle: "Supermarine Spitfire",
    fact: "Iconic elliptical‑wing WWII fighter.",
    specs: { role: "WWII fighter", engines: "1 × Merlin/Griffon" },
  },
  {
    id: "p51",
    model: "North American P‑51 Mustang",
    type: "vintage",
    wikiTitle: "North American P-51 Mustang",
    fact: "Long‑range WWII escort fighter renowned for performance.",
    specs: { role: "WWII fighter", engines: "1 × Merlin" },
  },

  // General aviation
  {
    id: "c172",
    model: "Cessna 172 Skyhawk",
    type: "general",
    wikiTitle: "Cessna 172",
    fact: "One of the most produced aircraft ever; a pilot trainer staple.",
    specs: { role: "GA trainer", engines: "1 × piston" },
  },
  {
    id: "sr22",
    model: "Cirrus SR22",
    type: "general",
    wikiTitle: "Cirrus SR22",
    fact: "High‑performance GA aircraft with whole‑airframe parachute.",
    specs: { role: "GA", engines: "1 × piston" },
  },
  {
    id: "kingair350",
    model: "Beechcraft King Air 350",
    type: "general",
    wikiTitle: "Beechcraft King Air",
    fact: "Popular twin‑turboprop for business and utility roles.",
    specs: { role: "GA turboprop", engines: "2 × PT6A" },
  },
  {
    id: "da42",
    model: "Diamond DA42",
    type: "general",
    wikiTitle: "Diamond DA42 Twin Star",
    fact: "Modern composite twin notable for efficiency.",
    specs: { role: "GA twin", engines: "2 × diesel" },
  },
];

const TYPES: Array<Aircraft["type"]> = [
  "commercial",
  "military",
  "vintage",
  "general",
];

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

  // Reset timer when seconds or restartKey changes
  useEffect(() => {
    setTimeLeft(seconds);
    startedAt.current = performance.now();
  }, [seconds, restartKey]);

  useEffect(() => {
    if (!isRunning) return;
    const tick = () => {
      if (startedAt.current == null) return;
      const elapsed = (performance.now() - startedAt.current) / 1000;
      const left = Math.max(0, seconds - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        onElapsed();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [isRunning, onElapsed, seconds]);

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
  const [questionsPerRun, setQuestionsPerRun] = useState(
    QUIZ_DEFAULTS.questionsPerRun
  );

  // Quiz runtime state
  const [questionIndex, setQuestionIndex] = useState(0);
  const [current, setCurrent] = useState<{
    correct: Aircraft | null;
    options: Aircraft[];
    imageUrl: string | null;
    questionKey: number;
  } | null>(null);

  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<
    | null
    | { correct: boolean; fact: string; correctModel: string; points: number }
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

  // Leaderboard (local)
  const [leaderboard, setLeaderboard] = useState<
    Array<{ name: string; score: number; date: string }>
  >(() => {
    try {
      return JSON.parse(localStorage.getItem("airquiz_leaderboard_v1") || "[]");
    } catch {
      return [];
    }
  });
  const [askName, setAskName] = useState<string | null>(null);

  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Generate next question
  async function nextQuestion(resetKey = false) {
    if (filteredDB.length < OPTIONS_PER_QUESTION) return;

    // Pick a correct aircraft not seen this session
    let pool = filteredDB.filter((a) => !seenIdsRef.current.has(a.id));
    if (pool.length === 0) {
      seenIdsRef.current.clear();
      pool = filteredDB;
    }
    const correct = choice(pool);

    const distractorsPool = filteredDB.filter((a) => a.id !== correct.id);
    const distractors = shuffle(distractorsPool).slice(
      0,
      OPTIONS_PER_QUESTION - 1
    );
    const options = shuffle([correct, ...distractors]);
    console.assert(
      options.length === OPTIONS_PER_QUESTION,
      "options length should be 4"
    );

    // Load image (Wikipedia or poster)
    const imageUrl = await fetchImageForAircraft(correct);

    // Ensure no exact photo repeats within a session
    let finalUrl = imageUrl;
    if (seenPhotosRef.current.has(finalUrl)) {
      let attempts = 0;
      while (attempts < 4 && seenPhotosRef.current.has(finalUrl)) {
        const alt = choice(filteredDB);
        finalUrl = await fetchImageForAircraft(alt);
        attempts++;
      }
    }
    seenPhotosRef.current.add(finalUrl);

    setCurrent({
      correct,
      options,
      imageUrl: finalUrl,
      questionKey: resetKey ? Date.now() : Math.random(),
    });
  }

  function resetRun() {
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setFeedback(null);
    setLocked(false);
    setQuestionIndex(0);
    seenIdsRef.current.clear();
    seenPhotosRef.current.clear();
  }

  async function startQuiz() {
    resetRun();
    setScreen("quiz");
    await nextQuestion(true);
  }

  // Timer
  const timeLeft = useCountdown(
    questionTimeSec,
    screen === "quiz" && !!current && !locked,
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
    });
    seenIdsRef.current.add(current.correct!.id);
  }

  async function handleNext() {
    setFeedback(null);
    setLocked(false);
    const nextIdx = questionIndex + 1;
    if (nextIdx >= questionsPerRun) {
      // End of run -> save leaderboard
      const maybeTop = isTopScore(score, leaderboard);
      if (maybeTop) setAskName(defaultPlayerName());
      setScreen("result");
      return;
    }
    setQuestionIndex(nextIdx);
    await nextQuestion();
  }

  function saveLeaderboard(name: string) {
    const entry = {
      name: name.trim() || "Pilot",
      score,
      date: new Date().toISOString(),
    };
    const updated = [...leaderboard, entry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    setLeaderboard(updated);
    localStorage.setItem("airquiz_leaderboard_v1", JSON.stringify(updated));
  }

  function resetLeaderboard() {
    setLeaderboard([]);
    localStorage.removeItem("airquiz_leaderboard_v1");
  }

  const progressPct = useMemo(
    () =>
      Math.round(
        ((questionIndex + (feedback ? 1 : 0)) / questionsPerRun) * 100
      ),
    [questionIndex, questionsPerRun, feedback]
  );

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">
      <TopBar
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        score={score}
        streak={streak}
        screen={screen}
      />

      {screen === "menu" && (
        <MenuScreen
          enabledTypes={enabledTypes}
          setEnabledTypes={setEnabledTypes}
          questionsPerRun={questionsPerRun}
          setQuestionsPerRun={setQuestionsPerRun}
          onStart={startQuiz}
          onLearn={() => setScreen("learn")}
        />
      )}

      {screen === "quiz" && current && (
        <QuizScreen
          key={current.questionKey}
          current={current}
          questionIndex={questionIndex}
          totalQuestions={questionsPerRun}
          timeLeft={timeLeft}
          totalTime={questionTimeSec}
          onAnswer={handleAnswer}
          onNext={handleNext}
          locked={locked}
          feedback={feedback}
          progressPct={progressPct}
        />
      )}

      {screen === "result" && (
        <ResultScreen
          score={score}
          bestStreak={bestStreak}
          onPlayAgain={startQuiz}
          onBackToMenu={() => setScreen("menu")}
        />
      )}

      {screen === "learn" && (
        <LearnModeScreen
          db={AIRCRAFT_DB}
          enabledTypes={enabledTypes}
          setEnabledTypes={setEnabledTypes}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal
          leaderboard={leaderboard}
          onClose={() => setShowLeaderboard(false)}
          onReset={resetLeaderboard}
        />
      )}

      {askName !== null && (
        <NamePrompt
          defaultName={askName}
          onCancel={() => setAskName(null)}
          onSave={(n) => {
            saveLeaderboard(n);
            setAskName(null);
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
  screen,
  onOpenLeaderboard,
}: {
  score: number;
  streak: number;
  screen: string;
  onOpenLeaderboard: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-500/20 ring-1 ring-sky-400/40" />
          <h1 className="text-lg font-semibold tracking-tight">
            Airplane <span className="text-sky-400">Spotter</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-slate-400">Score</span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold">{score}</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-slate-400">Streak</span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold">{streak}🔥</span>
          </div>
          <button
            onClick={onOpenLeaderboard}
            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:border-sky-600/40 hover:bg-slate-900/80"
          >
            Leaderboard
          </button>
        </div>
      </div>
    </header>
  );
}

function MenuScreen({
  enabledTypes,
  setEnabledTypes,
  questionsPerRun,
  setQuestionsPerRun,
  onStart,
  onLearn,
}: any) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-4 text-xl font-semibold">Choose aircraft types</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TYPES.map((t) => (
              <label
                key={t}
                className={classNames(
                  "group flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 text-sm",
                  enabledTypes[t]
                    ? "border-sky-600/40 bg-sky-500/10"
                    : "border-slate-800 bg-slate-900/40"
                )}
              >
                <span className="capitalize">{t}</span>
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={enabledTypes[t]}
                  onChange={(e) =>
                    setEnabledTypes((s: any) => ({ ...s, [t]: e.target.checked }))
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-4 text-xl font-semibold">Game options</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Questions per round
              </label>
              <input
                type="range"
                min={5}
                max={20}
                value={questionsPerRun}
                onChange={(e) => setQuestionsPerRun(parseInt(e.target.value))}
                className="w-full accent-sky-500"
              />
              <div className="mt-1 text-xs text-slate-400">
                {questionsPerRun} questions
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Time per question is fixed at <strong>15s</strong>. Options per question is fixed at <strong>4</strong>.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onStart}
            className="rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950 shadow hover:bg-sky-400"
          >
            Start quiz
          </button>
          <button
            onClick={onLearn}
            className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-3 font-semibold hover:border-slate-700"
          >
            Learn mode
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
        <h2 className="mb-2 text-xl font-semibold">How it works</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>We fetch a high‑quality image for a random aircraft model.</li>
          <li>Pick the correct model from 4 shuffled options.</li>
          <li>Answer fast for more points. Build streaks to unlock bonuses.</li>
          <li>No exact photo repeats in the same session.</li>
          <li>Browse the fleet in Learn Mode with filters & specs.</li>
        </ul>
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
          Tip: You can switch the image source or plug another API by editing
          <code> fetchImageForAircraft()</code>.
        </div>
      </div>
    </div>
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
  locked,
  feedback,
  progressPct,
}: any) {
  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / totalTime) * 100)));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      {/* Progress */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
          <span>
            Question {questionIndex + 1} / {totalQuestions}
          </span>
          <span>Time: {Math.ceil(timeLeft)}s</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-slate-800">
          <div
            className="h-full bg-sky-500 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Photo */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {current.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.imageUrl}
            alt={current.correct?.model}
            className={classNames(
              "h-full w-full object-cover transition-opacity duration-500",
              locked ? "opacity-60" : "opacity-100"
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            Loading image…
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(transparent,rgba(2,6,23,0.6))]" />
      </div>

      {/* Options */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {current.options.map((a: Aircraft) => (
          <button
            key={a.id}
            disabled={locked}
            onClick={() => onAnswer(a)}
            className={classNames(
              "rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
              "border-slate-800 bg-slate-900 hover:border-sky-600/40 hover:bg-slate-900/80",
              locked && a.id === current.correct.id &&
                "border-emerald-500/60 bg-emerald-500/10"
            )}
          >
            {a.model}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {feedback && !feedback.correct && (
        <div
          className={classNames(
            "mt-4 rounded-xl border p-4",
            "border-rose-600/40 bg-rose-500/10"
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Not quite.</div>
              <div className="mt-1 text-sm text-slate-200">
                Answer: <span className="font-medium">{feedback.correctModel}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{feedback.fact}</p>
            </div>
            <div>
              <button
                onClick={onNext}
                className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-400"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && feedback.correct && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3">
          <div className="text-sm font-semibold">
            Correct!
            <span className="ml-2 text-slate-300">
              {"+" + feedback.points + " pts"}
            </span>
          </div>
          <button
            onClick={onNext}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
          >
            Next
          </button>
        </div>
      )}

      {/* Round Progress */}
      <div className="mt-6">
        <div className="h-1 overflow-hidden rounded bg-slate-800">
          <div
            className="h-full bg-sky-600 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </main>
  );
}

function ResultScreen({ score, bestStreak, onPlayAgain, onBackToMenu }: any) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <h2 className="text-2xl font-bold">Flight complete ✈️</h2>
        <p className="mt-2 text-slate-300">Final score</p>
        <div className="mt-2 text-5xl font-extrabold text-sky-400">{score}</div>
        <div className="mt-3 text-sm text-slate-300">Best streak: {bestStreak} in a row</div>
        <div className="mt-6 flex items-center justify-center gap-3">
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

function LeaderboardModal({ leaderboard, onClose, onReset }: any) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Local leaderboard</h3>
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
            {leaderboard.map((e: any, i: number) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <span className="text-sm">
                  <span className="mr-2 rounded bg-slate-800 px-2 py-0.5 text-xs">#{i + 1}</span>
                  {e.name}
                </span>
                <span className="text-sm font-semibold text-sky-400">{e.score}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 text-right">
          <button
            onClick={onReset}
            className="text-xs text-slate-400 underline decoration-dotted underline-offset-4 hover:text-slate-200"
          >
            Reset leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}

function NamePrompt({ defaultName, onSave, onCancel }: any) {
  const [name, setName] = useState(defaultName || "Pilot");
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold">New high score!</h3>
        <p className="mt-1 text-sm text-slate-300">Add your name to the leaderboard.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          maxLength={24}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-800 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(name)}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function LearnModeScreen({ db, enabledTypes, setEnabledTypes }: any) {
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
        <h2 className="text-xl font-semibold">Learn mode</h2>
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
          placeholder="Search models or roles…"
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
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="relative aspect-video w-full">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={a.model} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            Loading…
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2 rounded bg-slate-950/70 px-2 py-1 text-xs capitalize text-slate-200 ring-1 ring-slate-800">
          {a.type}
        </div>
      </div>
      <div className="p-4">
        <div className="text-sm font-semibold">{a.model}</div>
        <div className="mt-1 text-xs text-slate-300">{a.specs.role}</div>
        <p className="mt-2 text-sm text-slate-300">{a.fact}</p>
      </div>
    </div>
  );
}

// --------------------------
// Helpers
// --------------------------
function isTopScore(score: number, board: Array<{ score: number }>) {
  if (board.length < 10) return true;
  return score > board[board.length - 1].score;
}

function defaultPlayerName() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return `Pilot@${tz.split("/").pop()}`;
  } catch {
    return "Pilot";
  }
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
