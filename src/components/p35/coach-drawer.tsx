import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HevyWorkout } from "@/lib/hevy.functions";
import type { WeightEntry } from "@/components/p35/weight-card";
import {
  DAILY_TARGETS,
  getGoalWeight,
  getLongTermTarget,
  getActiveBlockCountdown,
} from "@/lib/project35";
import {
  useCoachMessages,
  type CoachMsg,
} from "@/lib/p35-cloud";
import {
  KeyRound,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import { APP_NAME, IS_PROJECT_35 } from "@/lib/config";

const COACH_NAME = IS_PROJECT_35
  ? "Coach Clive"
  : "Coach Neil is Gay";

type Msg = CoachMsg;

// ============================================================
// PERFORMANCE SETTINGS
// ============================================================

const WORKOUT_HISTORY_DAYS = 7;

// Recently rate-limited models are skipped for this long on subsequent requests.
const MODEL_COOLDOWN_MS = 60_000;

// Prevent a hanging model request from blocking the fallback chain.
const MODEL_REQUEST_TIMEOUT_MS = 12_000;

// ============================================================
// AI COACH SYSTEM INSTRUCTIONS
// ============================================================

const SYSTEM_INSTRUCTIONS = `You are the ${APP_NAME} performance coach: direct, knowledgeable, conversational, and technically sharp.

CONTEXT & TONE:
- Your name is ${COACH_NAME}.
- You are my coach. You can call me ${
  IS_PROJECT_35
    ? "Ryan, Chief, Boss or mate"
    : "Gay Cunt, Chief, Boss or mate"
} but only if it really calls for it, " Gay cunt" is specifically if I am moaning. In general conversation refrain from using a name; keep it precise and to the point and only use names if it explicitly needs it.

- You are an expert strength and conditioning partner helping the athlete progress across their current macrocycle toward the long-term target supplied in the athlete data below.
- Match the user's intent. If they greet you ("hey", "hello"), respond naturally and ask what they want to tackle today.
- If they ask general questions about exercise swaps, pain management, recovery, upcoming phases, or pacing, provide direct, intelligent advice grounded in their current block targets without forcing rigid templates.
- Strictly respect the exact unit logged by the user for lifts (whether lbs or kg) and pounds for bodyweight. Never convert or translate their logged weight units. Keep responses crisp and actionable.

RESPONSE LENGTH:
- Keep normal answers concise and direct.
- Do not repeat information already present in the athlete context.
- Only give detailed responses when the user explicitly asks for detail or when a workout analysis requires it.

WORKOUT ANALYSIS MODE:
Trigger this specific structured format ONLY when the user explicitly asks to analyse, review, or evaluate a workout/session:

- For resistance exercises:
  * Evaluate the final set RPE:
    - RPE < 7.0: PROMOTE (+ load next session).
    - RPE 7.0–8.0: PROGRESS REPS (+1 rep next session).
    - RPE 8.5–9.0: STICK (Consolidate weight/form).
    - RPE 9.5–10.0: HOLD OR DROP (-1 rep).
    - Pain flag: SWAP OR DELOAD (-20% or neutral grip alternative).
  * Never assume an initial heavier set with fewer reps is an "adjustment" or warm-up. Treat decreasing weight across sets as intentional reverse pyramid or load drops.

- For cardio exercises (walking, treadmill, elliptical, etc.):
  * Evaluate pace, duration, and distance against daily step and aerobic recovery goals.
  * Next session call should focus on maintaining baseline, increasing duration, or managing joint impact.

- For each exercise, use the exact label format:
- **Logged:** [details]
- **Assessment:** [details]
- **Next Session Call:** [details]
- **Athlete Notes Feedback:** [details]

- Conclude ONLY workout analyses with a 3-bullet "Next Session Battle Plan".

ROUTINE PREP & TARGET MODE:
Trigger this format when the user asks for targets or prep for a specific routine:
- Search the HISTORICAL WORKOUT data for the MOST RECENT session matching that routine title.
- For each exercise in that session:
  * State what was logged last time: weight, reps, and RPE.
  * Evaluate RPE against progression rules (RPE < 7.0: PROMOTE load; RPE 7.0–8.0: PROGRESS REPS; RPE 8.5–9.0: STICK; RPE 9.5–10: HOLD/DROP).
  * State the target call for today's session.
- Format strictly as:

**[Exercise Name]**
- **Last:** [Weight x Reps @ RPE]
- **Today's Target:** [Specific weight/rep call]
- **Note:** [Athlete notes or progression cue if applicable]

- Conclude with a single bullet focus cue for the session.
${
  IS_PROJECT_35
    ? ""
    : `

WORKOUT HISTORY RULES:
- Every stored Hevy workout is a separate session.
- Use the supplied WORKOUT ID and date/time to distinguish sessions.
- Never assume two workouts are the same session merely because they contain the same exercises or similar weights.
- Never claim that a workout has already been analysed simply because an older workout in the history looks similar.
- When analysing a workout, analyse the specific workout identified as the CURRENT WORKOUT.
- Historical workouts are provided for comparison and progression context only.
- Do not invent RPE values when none were logged.
- Do not invent exercises, sets, weights, distances, durations or notes.`
}`;

// ============================================================
// PREFERRED GEMINI MODELS
// ============================================================

const PREFERRED_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

// ============================================================
// GEMINI MODEL CACHE
// ============================================================

const modelDiscoveryCache = new Map<string, Promise<string[]>>();

// ============================================================
// GEMINI MODEL COOLDOWN CACHE
// ============================================================

const modelCooldownCache = new Map<string, Map<string, number>>();

function markModelCooldown(apiKey: string, model: string): void {
  let keyCooldowns = modelCooldownCache.get(apiKey);
  if (!keyCooldowns) {
    keyCooldowns = new Map<string, number>();
    modelCooldownCache.set(apiKey, keyCooldowns);
  }
  keyCooldowns.set(model, Date.now() + MODEL_COOLDOWN_MS);
}

function clearModelCooldown(apiKey: string, model: string): void {
  modelCooldownCache.get(apiKey)?.delete(model);
}

function isModelCoolingDown(apiKey: string, model: string): boolean {
  const keyCooldowns = modelCooldownCache.get(apiKey);
  if (!keyCooldowns) return false;
  const expiresAt = keyCooldowns.get(model);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    keyCooldowns.delete(model);
    return false;
  }
  return true;
}

// ============================================================
// DISCOVER AVAILABLE GEMINI MODELS
// ============================================================

async function getAvailableModels(apiKey: string): Promise<string[]> {
  const availableModels: {
    baseModelId?: string;
    name?: string;
    supportedGenerationMethods?: string[];
  }[] = [];

  let pageToken = "";

  do {
    const query = new URLSearchParams({
      key: apiKey,
      pageSize: "1000",
    });

    if (pageToken) query.set("pageToken", pageToken);

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?${query.toString()}`;
    const listRes = await fetch(listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const listData = await listRes.json().catch(() => ({}));

    if (!listRes.ok) {
      throw new Error(
        listData.error?.message ||
          `Unable to list Gemini models (HTTP ${listRes.status}).`,
      );
    }

    if (Array.isArray(listData.models)) {
      availableModels.push(...listData.models);
    }

    pageToken = listData.nextPageToken || "";
  } while (pageToken);

  const modelIds = availableModels
    .filter((m) => Array.isArray(m.supportedGenerationMethods))
    .filter((m) =>
      m.supportedGenerationMethods!.includes("generateContent"),
    )
    .map((m) => {
      if (m.baseModelId) return m.baseModelId;
      if (m.name) return m.name.replace(/^models\//, "");
      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(modelIds));
}

function getCachedAvailableModels(apiKey: string): Promise<string[]> {
  const cached = modelDiscoveryCache.get(apiKey);
  if (cached) return cached;

  const promise = getAvailableModels(apiKey)
    .then((models) => models)
    .catch((error) => {
      modelDiscoveryCache.delete(apiKey);
      throw error;
    });

  modelDiscoveryCache.set(apiKey, promise);
  return promise;
}

function isUsableCoachModel(model: string): boolean {
  const lower = model.toLowerCase();
  const excludedPatterns = [
    "embedding",
    "image",
    "imagen",
    "live",
    "tts",
    "transcribe",
    "robotics",
    "veo",
  ];
  return !excludedPatterns.some((pattern) => lower.includes(pattern));
}

function rankModels(availableModels: string[]): string[] {
  const usableModels = availableModels.filter(isUsableCoachModel);
  const preferred = PREFERRED_MODELS.filter((m) => usableModels.includes(m));
  const otherModels = usableModels.filter((m) => !PREFERRED_MODELS.includes(m));
  return [...preferred, ...otherModels];
}

// ============================================================
// HEVY HISTORY CACHE
// ============================================================

type StoredHevyWorkout = HevyWorkout & {
  id?: string;
};

let hevyHistoryRawCache: string | null = null;
let hevyHistoryParsedCache: StoredHevyWorkout[] = [];

// ============================================================
// CARDIO DETECTION
// ============================================================

function isCardioExercise(exerciseTitle: string, sets: any[]): boolean {
  const title = exerciseTitle.toLowerCase();
  const cardioKeywords = [
    "walk",
    "run",
    "treadmill",
    "elliptical",
    "cycle",
    "bike",
    "rowing",
    "stair",
    "bjj",
    "grappling",
    "wrestling",
  ];

  const matchesKeyword = cardioKeywords.some((k) => title.includes(k));
  const hasCardioMetrics = sets.some(
    (s) =>
      s.distance_meters != null ||
      s.distanceMeters != null ||
      s.duration_seconds != null ||
      s.durationSeconds != null ||
      s.km != null ||
      (s.weightKg == null &&
        s.weight_kg == null &&
        s.weightLbs == null &&
        s.reps == null),
  );

  return matchesKeyword || hasCardioMetrics;
}

// ============================================================
// CARDIO FORMATTER
// ============================================================

function formatCardio(s: any): string {
  const meters =
    s.distance_meters ??
    s.distanceMeters ??
    s.distance ??
    (s.km != null ? s.km * 1000 : null);

  const kmString = meters != null ? `${(meters / 1000).toFixed(2)} km` : null;

  const totalSec =
    s.duration_seconds ?? s.durationSeconds ?? s.duration ?? s.time;

  let timeString: string | null = null;

  if (typeof totalSec === "number") {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (hrs > 0) {
      timeString = `${hrs}h ${mins}min`;
    } else if (mins > 0) {
      timeString = `${mins}min`;
    } else {
      timeString = `${secs}s`;
    }
  } else if (typeof totalSec === "string") {
    timeString = totalSec;
  }

  const parts = [timeString, kmString].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Completed";
}

// ============================================================
// WEIGHT FORMATTER
// ============================================================

function formatWeight(s: any, exerciseTitle: string): string {
  const rawWeight =
    s.weightLbs ?? s.weight_lbs ?? s.weightKg ?? s.weight_kg;

  if (rawWeight == null) {
    return "BW";
  }

  const titleLower = exerciseTitle.toLowerCase();
  const isCableOrLbs =
    (titleLower.includes("cable") && !titleLower.includes("lat pulldown")) ||
    titleLower.includes("pushdown") ||
    titleLower.includes("fly");

  if (s.weightLbs != null || s.weight_lbs != null) {
    const val = s.weightLbs ?? s.weight_lbs;
    const snapped = Math.round(val * 2) / 2;
    return `${snapped}lbs`;
  }

  if (isCableOrLbs) {
    const rawLbs = rawWeight * 2.20462;
    const snappedLbs = Math.round(rawLbs * 2) / 2;
    return `${snappedLbs}lbs`;
  }

  const roundedKg = Number.isInteger(rawWeight)
    ? rawWeight
    : Math.round(rawWeight * 10) / 10;

  return `${roundedKg}kg`;
}

// ============================================================
// STORED HEVY HISTORY
// ============================================================

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getWorkoutId(workout: HevyWorkout): string {
  const fingerprint = JSON.stringify({
    title: workout.title?.trim().toLowerCase() ?? "",
    startTime: workout.startTime ?? "",
    exercises: workout.exercises.map((ex) => ({
      title: ex.title?.trim().toLowerCase() ?? "",
      notes: ex.notes ?? "",
      sets: ex.sets.map((s: any) => ({
        weightKg: s.weightKg ?? s.weight_kg ?? null,
        weightLbs: s.weightLbs ?? s.weight_lbs ?? null,
        reps: s.reps ?? null,
        rpe: s.rpe ?? null,
        distance_meters: s.distance_meters ?? s.distanceMeters ?? null,
        duration_seconds: s.duration_seconds ?? s.durationSeconds ?? null,
      })),
    })),
  });

  return `hevy_${hashString(fingerprint)}`;
}

function parseWorkoutDate(rawDate: string | null | undefined): number {
  if (!rawDate) return 0;
  const value = rawDate.trim();
  const ukMatch = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/,
  );

  if (ukMatch) {
    const [, day, month, year, hour = "0", minute = "0"] = ukMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).getTime();
  }

  const native = new Date(value);
  return Number.isNaN(native.getTime()) ? 0 : native.getTime();
}

function getStoredHevyHistory(): StoredHevyWorkout[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem("p35_hevy_workouts");
    if (!raw) {
      hevyHistoryRawCache = null;
      hevyHistoryParsedCache = [];
      return [];
    }

    if (raw === hevyHistoryRawCache) {
      return hevyHistoryParsedCache;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      hevyHistoryRawCache = raw;
      hevyHistoryParsedCache = [];
      return [];
    }

    const filtered = parsed.filter(
      (item): item is StoredHevyWorkout =>
        !!item &&
        typeof item === "object" &&
        typeof (item as StoredHevyWorkout).title === "string" &&
        Array.isArray((item as StoredHevyWorkout).exercises),
    );

    hevyHistoryRawCache = raw;
    hevyHistoryParsedCache = filtered;
    return filtered;
  } catch {
    return [];
  }
}

function getRecentHevyHistory(
  currentWorkout: HevyWorkout | null = null,
): StoredHevyWorkout[] {
  const stored = getStoredHevyHistory();
  const now = Date.now();
  const cutoff = now - WORKOUT_HISTORY_DAYS * 24 * 60 * 60 * 1000;

  const withIds = stored.map((item) => ({
    ...item,
    id: item.id ?? getWorkoutId(item),
  }));

  const recent = withIds.filter((item) => {
    const timestamp = parseWorkoutDate(item.startTime);
    return timestamp > 0 && timestamp >= cutoff;
  });

  if (currentWorkout) {
    const currentId = getWorkoutId(currentWorkout);
    const exists = recent.some((item) => item.id === currentId);
    if (!exists) {
      recent.push({
        ...currentWorkout,
        id: currentId,
      });
    }
  }

  return recent.sort(
    (a, b) =>
      parseWorkoutDate(a.startTime) - parseWorkoutDate(b.startTime),
  );
}

// ============================================================
// EXERCISE DESCRIPTION
// ============================================================

function describeExercise(ex: HevyWorkout["exercises"][number]): string {
  if (isCardioExercise(ex.title, ex.sets)) {
    const cardioSummary = ex.sets.map((s: any) => formatCardio(s)).join(", ");
    const notes = ex.notes ? ` | Notes: "${ex.notes}"` : "";
    return `- ${ex.title} (Cardio/Conditioning): ${cardioSummary}${notes}`;
  }

  const setStr = ex.sets
    .map((s: any) => {
      const weightDisplay = formatWeight(s, ex.title);
      const rpe = s.rpe != null ? ` @RPE${s.rpe}` : "";
      return `${weightDisplay} x ${s.reps ?? "?"}${rpe}`;
    })
    .join(", ");

  const lastSet = ex.sets[ex.sets.length - 1];
  const rpeStr = lastSet?.rpe != null ? ` | Final set RPE: ${lastSet.rpe}` : "";
  const notesStr = ex.notes ? ` | Notes: "${ex.notes}"` : "";
  const setNotesStr = lastSet?.notes ? ` | Set notes: "${lastSet.notes}"` : "";

  return `- ${ex.title}: ${setStr}${rpeStr}${notesStr}${setNotesStr}`;
}

// ============================================================
// BUILD HISTORY CONTEXT
// ============================================================

function buildHistoryLines(workout: HevyWorkout | null): string[] {
  const recentHistory = getRecentHevyHistory(workout);
  let currentWorkoutId: string | null = null;

  if (workout) {
    currentWorkoutId = getWorkoutId(workout);
  }

  const lines: string[] = [
    "",
    `HEVY WORKOUT HISTORY: ${recentHistory.length} session(s) from the last ${WORKOUT_HISTORY_DAYS} days.`,
  ];

  if (recentHistory.length === 0) {
    lines.push("No recent Hevy workout history stored yet.");
  }

  for (const historyWorkout of recentHistory) {
    const id = historyWorkout.id ?? getWorkoutId(historyWorkout);

    lines.push(
      "",
      `${
        currentWorkoutId === id ? "CURRENT WORKOUT" : "HISTORICAL WORKOUT"
      } — ID: ${id}`,
      `Title: "${historyWorkout.title}"`,
      `Date/time: ${historyWorkout.startTime ?? "unknown"}`,
      ...historyWorkout.exercises.map(describeExercise),
    );
  }

  if (workout && currentWorkoutId) {
    lines.push(
      "",
      `IMPORTANT: The CURRENT WORKOUT for this request is ID ${currentWorkoutId}.`,
      "Analyse this exact session when the user requests workout analysis. Historical sessions are comparison data only.",
    );
  }

  return lines;
}

// ============================================================
// BUILD LIVE COACH CONTEXT
// ============================================================

function buildContext(
  workout: HevyWorkout | null,
  entries: WeightEntry[],
): string {
  const block = getActiveBlockCountdown();

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const trend =
    sorted
      .slice(-6)
      .map((e) => `${e.date}: ${e.weight} lb`)
      .join(", ") || "no weigh-ins logged yet";

  const latest = sorted[sorted.length - 1]?.weight;

  const lines = [
    `CURRENT BLOCK: ${block.phaseTitle} • ${block.blockName} (Week ${block.currentWeek} of ${block.totalWeeks})`,
    `Block Focus: ${block.goal}`,
    `Bodyweight Target: ${getGoalWeight()} lbs (Latest logged: ${latest ?? "unknown"} lbs | Trend: ${trend})`,
    `Daily Nutrition/Habit Standards: ${DAILY_TARGETS.caloriesMin}–${DAILY_TARGETS.caloriesMax} kcal, ${DAILY_TARGETS.protein}g+ protein, ${DAILY_TARGETS.steps} steps daily.`,
    `Long-Term ${getLongTermTarget()}`,
  ];

  const history = buildHistoryLines(workout);

  if (history.length > 2) {
    lines.push(...history);
  } else if (workout) {
    lines.push(
      `LATEST WORKOUT LOGGED IN HEVY: "${workout.title}" on ${
        workout.startTime ?? "recent"
      }.`,
      ...workout.exercises.map(describeExercise),
    );
  } else {
    lines.push("No Hevy workout synced yet.");
  }

  return lines.join("\n");
}

// ============================================================
// RECENT UNIQUE ROUTINES
// ============================================================

function getRecentRoutines(): string[] {
  const history = getRecentHevyHistory();
  if (history.length === 0) return [];

  const sorted = [...history].sort(
    (a, b) =>
      parseWorkoutDate(b.startTime) - parseWorkoutDate(a.startTime),
  );

  const titles: string[] = [];
  for (const session of sorted) {
    const rawTitle = session.title?.trim();
    if (rawTitle && !titles.includes(rawTitle)) {
      titles.push(rawTitle);
    }
  }

  return titles;
}

// ============================================================
// REQUEST WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

// ============================================================
// CALL GEMINI
// ============================================================

async function callGemini(
  apiKey: string,
  history: CoachMsg[],
  newPrompt: string,
  systemContext: string,
): Promise<{
  text: string;
  model: string;
}> {
  const recentHistory = history.slice(-10);

  const contents = [
    ...recentHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : String(m.content ?? ""),
        },
      ],
    })),
    {
      role: "user",
      parts: [{ text: newPrompt }],
    },
  ];

  const payload = {
    systemInstruction: {
      parts: [
        {
          text:
            `${SYSTEM_INSTRUCTIONS}\n\n` +
            `ATHLETE PROFILE & LIVE METRICS:\n` +
            systemContext,
        },
      ],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
    },
  };

  let rankedModels: string[];
  try {
    const available = await getCachedAvailableModels(apiKey);
    rankedModels = rankModels(available);
  } catch {
    rankedModels = [...PREFERRED_MODELS];
  }

  if (rankedModels.length === 0) {
    rankedModels = [...PREFERRED_MODELS];
  }

  let lastErrorMsg = "Gemini request failed.";

  for (const model of rankedModels) {
    if (isModelCoolingDown(apiKey, model)) {
      continue;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
        },
        MODEL_REQUEST_TIMEOUT_MS,
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const replyText =
          data.candidates?.[0]?.content?.parts
            ?.map((part: any) =>
              typeof part?.text === "string" ? part.text : "",
            )
            .join("")
            .trim() || "";

        if (replyText) {
          clearModelCooldown(apiKey, model);
          return { text: replyText, model };
        }

        lastErrorMsg = `Model ${model} returned an empty response.`;
        continue;
      }

      const status = res.status;
      lastErrorMsg = data.error?.message || `HTTP ${status} from ${model}`;

      if (status === 401 || status === 403) {
        throw new Error(lastErrorMsg);
      }

      if (status === 429) {
        markModelCooldown(apiKey, model);
        continue;
      }

      continue;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        lastErrorMsg = `Model ${model} timed out after ${
          MODEL_REQUEST_TIMEOUT_MS / 1000
        }s.`;
        continue;
      }

      lastErrorMsg = err instanceof Error ? err.message : "Network error";
      continue;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastErrorMsg}`);
}

// ============================================================
// FORMATTED AI MESSAGE (WITH WORKOUT HEADING FIX)
// ============================================================

function CoachText({ text }: { text: unknown }) {
  const safeText =
    typeof text === "string" ? text : text == null ? "" : String(text);

  // Normalise lines, remove dividers, and filter empty whitespace
  const rawLines = safeText
    .replace(/---/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {rawLines.map((line, idx) => {
        // Detect Markdown headers, numbered headers, or bold exercise titles: **Exercise Name**
        const isHeading =
          /^#{1,4}\s+/.test(line) ||
          (/^(\*\*\d+\.|\*\*)[^*]+?\*\*$/.test(line) && !line.includes(":"));

        const isBullet = /^[•*–-]\s+/.test(line);

        const cleanLine = line
          .replace(/^#{1,4}\s+/, "")
          .replace(/^[•*–-]\s+/, "")
          .trim();

        if (isHeading) {
          return (
            <h4
              key={idx}
              className="font-bold text-foreground mt-3 mb-1 text-sm tracking-tight"
            >
              {cleanLine.replace(/\*\*/g, "")}
            </h4>
          );
        }

        return (
          <p
            key={idx}
            className={
              isBullet
                ? "pl-3 flex items-start gap-2 font-medium"
                : "font-normal text-muted-foreground/90"
            }
          >
            {isBullet && (
              <span className="text-primary mt-1 shrink-0">•</span>
            )}
            <span className="flex-1">
              {cleanLine.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i} className="text-primary font-semibold">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
            </span>
          </p>
        );
      })}
    </div>
  );
}

// ============================================================
// COACH DRAWER
// ============================================================

export function CoachDrawer({
  workout,
  entries,
  userId,
}: {
  workout: HevyWorkout | null;
  entries: WeightEntry[];
  userId: string | null;
}) {
  const [open, setOpen] = useState(false);

  const recentRoutines = useMemo(() => getRecentRoutines(), [workout]);

  const { messages, add } = useCoachMessages(userId);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("p35_gemini_api_key") || ""
      : "",
  );

  const [draftApiKey, setDraftApiKey] = useState(apiKey);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "auto" });
    }, 50);
    return () => clearTimeout(timer);
  }, [open, messages.length]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body || !endRef.current) {
      return;
    }
    endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const saveGeminiKey = (key: string) => {
    const clean = key.trim();
    localStorage.setItem("p35_gemini_api_key", clean);
    setApiKey(clean);
    setDraftApiKey(clean);
    setKeyDialogOpen(false);
    toast.success(clean ? "Gemini key saved." : "Gemini key removed.");
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const currentKey = localStorage.getItem("p35_gemini_api_key") || "";
    const cleanKey = currentKey.replace(/\s+/g, "");

    if (!cleanKey) {
      setKeyDialogOpen(true);
      toast.error("Add your Gemini API key first.");
      return;
    }

    if (cleanKey !== apiKey) {
      setApiKey(cleanKey);
    }

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setLoading(true);
    setLastFailedPrompt(null);

    try {
      const currentHistory = [...messages];
      const context = buildContext(workout, entries);

      await add.mutateAsync({
        role: "user",
        content: trimmed,
      });

      const { text: reply, model } = await callGemini(
        cleanKey,
        currentHistory,
        trimmed,
        context,
      );

      const safeReply =
        typeof reply === "string" ? reply : String(reply ?? "");

      setActiveModel(model);

      await add.mutateAsync({
        role: "assistant",
        content: safeReply,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Coach is unavailable.";
      console.error("Coach request failed:", error);
      toast.error(errorMessage);
      setLastFailedPrompt(trimmed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            aria-label="Open Coach AI"
            className="glow-ring fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 size-14 rounded-full"
          >
            <MessageSquare className="size-6" />
          </Button>
        </SheetTrigger>

        <SheetContent side="bottom" className="flex h-[88vh] flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                {COACH_NAME}
              </SheetTitle>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setKeyDialogOpen(true)}
                aria-label="Gemini API Key Settings"
              >
                <KeyRound className="size-5" />
              </Button>
            </div>

            <SheetDescription>
              Direct, no-fluff accountability on your numbers.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && !loading && (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Ask anything about your lifts, exercise swaps, upcoming phases, or tap the button below for a full session breakdown.
              </p>
            )}

            {messages.map((m, i) => {
              const isLastAssistant =
                m.role === "assistant" && i === messages.length - 1;
              const safeMessageContent =
                typeof m.content === "string"
                  ? m.content
                  : String(m.content ?? "");

              return (
                <div key={i} className="space-y-1">
                  <div
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                        : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface-2/70 px-4 py-2.5 text-sm"
                    }
                  >
                    {m.role === "assistant" ? (
                      <CoachText text={safeMessageContent} />
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {safeMessageContent}
                      </div>
                    )}
                  </div>

                  {isLastAssistant && activeModel && (
                    <div className="flex items-center gap-1 pl-2 text-[10px] text-muted-foreground/60">
                      <Cpu className="size-2.5" />
                      <span>{activeModel}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="mr-auto flex items-center gap-2 rounded-2xl border border-border bg-surface-2/70 px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Thinking...
              </div>
            )}

            {lastFailedPrompt && !loading && (
              <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                <span>Request failed. Tap retry when ready.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 border-rose-500/40 text-rose-300 hover:bg-rose-500/20"
                  onClick={() => void send(lastFailedPrompt)}
                >
                  <RefreshCw className="size-3.5" />
                  Retry
                </Button>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <div className="space-y-2 border-t border-border bg-surface-2/40 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {recentRoutines.length > 0 && (
              <div className="space-y-1.5 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Today's Session Targets:
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {recentRoutines.map((routine) => (
                    <Button
                      key={routine}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 border-border bg-surface-2/60 px-2.5 text-xs hover:border-primary hover:text-primary"
                      disabled={loading}
                      onClick={() =>
                        send(
                          `I'm about to do "${routine}". Find the last time I logged this specific routine in my workout history, pull the exercises with their previous weights and RPE, and give me my targets and progression calls for today.`,
                        )
                      }
                    >
                      {routine}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="secondary"
              className="w-full"
              disabled={loading}
              onClick={() =>
                send(
                  "Please analyse my last Hevy workout against current block targets. Evaluate RPE for each exercise, provide promote/stick/deload calls, and build my next session plan.",
                )
              }
            >
              <Sparkles className="mr-2 size-4" />
              Analyse Last Session
            </Button>

            <form
              className="flex items-end gap-2 rounded-xl border border-border bg-surface-2 p-2 transition-colors focus-within:border-primary"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={handleInputResize}
                placeholder="Ask about a lift, swap, or current phase..."
                className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              />

              <Button
                type="submit"
                size="icon"
                className="mb-0.5 size-10 shrink-0"
                disabled={loading || !input.trim()}
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gemini API Key</DialogTitle>
            <DialogDescription>
              Stored locally on your device. Get a free API key from Google AI Studio (aistudio.google.com).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="gemini-key">API Key</Label>
            <Input
              id="gemini-key"
              type="password"
              placeholder="Paste AI Studio API key"
              value={draftApiKey}
              onChange={(e) => setDraftApiKey(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            {apiKey && (
              <Button variant="ghost" onClick={() => saveGeminiKey("")}>
                Remove key
              </Button>
            )}
            <Button onClick={() => saveGeminiKey(draftApiKey)}>
              Save key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
