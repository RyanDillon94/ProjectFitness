import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

// ============================================================
// CONSTANTS
// ============================================================

const COACH_NAME = IS_PROJECT_35
  ? "Coach Clive"
  : "Coach Neil is Gay";

const WORKOUT_HISTORY_DAYS = 7;

const MODEL_COOLDOWN_MS = 60_000;

const MODEL_REQUEST_TIMEOUT_MS = 7_000;

const MAX_CHAT_MESSAGES_SENT = 8;

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
// TYPES
// ============================================================

type Msg = CoachMsg;

type StoredHevyWorkout = HevyWorkout & {
  id?: string;
};

// ============================================================
// SYSTEM INSTRUCTIONS
// ============================================================

const SYSTEM_INSTRUCTIONS = `You are the ${APP_NAME} performance coach: direct, knowledgeable, conversational, and technically sharp.

CONTEXT & TONE:
- Your name is ${COACH_NAME}.
- You are my coach. You can call me ${
  IS_PROJECT_35
    ? "Ryan, Chief, Boss or mate"
    : "Gay Cunt, Chief, Boss or mate"
} but only if it really calls for it. In general conversation refrain from using a name; keep it precise and to the point.

- You are an expert strength and conditioning partner helping the athlete progress across their current macrocycle toward the long-term target supplied in the athlete data below.
- Match the user's intent.
- If they greet you, respond naturally and ask what they want to tackle.
- If they ask about exercise swaps, pain management, recovery, upcoming phases, or pacing, provide direct advice grounded in the current block.
- Strictly respect the exact unit logged by the user for lifts and pounds for bodyweight.
- Never convert or translate logged weight units.

RESPONSE LENGTH:
- Keep normal answers concise and direct.
- Do not repeat information already present.
- Only give detailed responses when explicitly requested or when workout analysis requires it.

WORKOUT ANALYSIS MODE:
Trigger ONLY when the user explicitly asks to analyse, review, or evaluate a workout/session.

Resistance exercises:
- RPE < 7.0: PROMOTE (+ load next session).
- RPE 7.0–8.0: PROGRESS REPS (+1 rep next session).
- RPE 8.5–9.0: STICK.
- RPE 9.5–10.0: HOLD OR DROP (-1 rep).
- Pain flag: SWAP OR DELOAD (-20% or neutral grip alternative).
- Never assume a heavier first set is a warm-up.
- Treat decreasing weight across sets as intentional reverse pyramid/load drops.

Cardio:
- Evaluate pace, duration, distance and aerobic recovery goals.
- Focus next session on baseline maintenance, duration increase, or impact management.

For each exercise:

### [Exercise Name]
- **Logged:** [details]
- **Assessment:** [details]
- **Next Session Call:** [details]
- **Athlete Notes Feedback:** [details]

Conclude workout analyses ONLY with:

- 3 bullet "Next Session Battle Plan".

ROUTINE PREP & TARGET MODE:
When the user asks for targets/prep for a specific routine:

- Search the supplied HISTORICAL WORKOUT data for the MOST RECENT matching routine title.
- State previous weight, reps and RPE.
- Evaluate against progression rules.
- Give today's specific target.

Format:

### [Exercise Name]
- **Last:** [Weight x Reps @ RPE]
- **Today's Target:** [Specific weight/rep call]
- **Note:** [Cue]

Conclude with one focus cue.

${
  IS_PROJECT_35
    ? ""
    : `

WORKOUT HISTORY RULES:
- Every stored Hevy workout is a separate session.
- Use workout ID and date/time.
- Never assume two workouts are the same session merely because they contain similar exercises.
- Never claim a workout was analysed merely because another session looks similar.
- Analyse the exact CURRENT WORKOUT.
- Historical workouts are comparison data only.
- Never invent RPE, exercises, sets, weights, distances, durations or notes.`
}`;

// ============================================================
// MODEL CACHE
// ============================================================

const modelDiscoveryCache =
  new Map<string, Promise<string[]>>();

const modelCooldownCache =
  new Map<string, Map<string, number>>();

function markModelCooldown(
  apiKey: string,
  model: string,
) {
  let cache =
    modelCooldownCache.get(apiKey);

  if (!cache) {
    cache = new Map();
    modelCooldownCache.set(apiKey, cache);
  }

  cache.set(
    model,
    Date.now() + MODEL_COOLDOWN_MS,
  );
}

function clearModelCooldown(
  apiKey: string,
  model: string,
) {
  modelCooldownCache
    .get(apiKey)
    ?.delete(model);
}

function isModelCoolingDown(
  apiKey: string,
  model: string,
) {
  const expires =
    modelCooldownCache
      .get(apiKey)
      ?.get(model);

  if (!expires) return false;

  if (Date.now() >= expires) {
    modelCooldownCache
      .get(apiKey)
      ?.delete(model);

    return false;
  }

  return true;
}

// ============================================================
// MODEL DISCOVERY
// ============================================================

async function getAvailableModels(
  apiKey: string,
): Promise<string[]> {
  const models: {
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

    if (pageToken) {
      query.set(
        "pageToken",
        pageToken,
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?${query}`,
      {
        method: "GET",
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );

    const data =
      await response.json().catch(
        () => ({}),
      );

    if (!response.ok) {
      throw new Error(
        data.error?.message ||
          `Unable to list Gemini models (HTTP ${response.status}).`,
      );
    }

    if (Array.isArray(data.models)) {
      models.push(...data.models);
    }

    pageToken =
      data.nextPageToken || "";
  } while (pageToken);

  return Array.from(
    new Set(
      models
        .filter((model) =>
          model.supportedGenerationMethods?.includes(
            "generateContent",
          ),
        )
        .map(
          (model) =>
            model.baseModelId ||
            model.name?.replace(
              /^models\//,
              "",
            ) ||
            "",
        )
        .filter(Boolean),
    ),
  );
}

function getCachedAvailableModels(
  apiKey: string,
): Promise<string[]> {
  const cached =
    modelDiscoveryCache.get(apiKey);

  if (cached) return cached;

  const promise =
    getAvailableModels(apiKey).catch(
      (error) => {
        modelDiscoveryCache.delete(
          apiKey,
        );
        throw error;
      },
    );

  modelDiscoveryCache.set(
    apiKey,
    promise,
  );

  return promise;
}

function isUsableCoachModel(
  model: string,
) {
  const lower =
    model.toLowerCase();

  const excluded = [
    "embedding",
    "image",
    "imagen",
    "live",
    "tts",
    "transcribe",
    "robotics",
    "veo",
  ];

  return !excluded.some((x) =>
    lower.includes(x),
  );
}

function rankModels(
  available: string[],
): string[] {
  const usable =
    available.filter(
      isUsableCoachModel,
    );

  const preferred =
    PREFERRED_MODELS.filter(
      (model) =>
        usable.includes(model),
    );

  const other =
    usable.filter(
      (model) =>
        !PREFERRED_MODELS.includes(
          model,
        ),
    );

  return [
    ...preferred,
    ...other,
  ];
}

// ============================================================
// HEVY CACHE
// ============================================================

let hevyHistoryRawCache:
  string | null = null;

let hevyHistoryParsedCache:
  StoredHevyWorkout[] = [];

// ============================================================
// CARDIO
// ============================================================

function isCardioExercise(
  exerciseTitle: string,
  sets: any[],
) {
  const title =
    exerciseTitle.toLowerCase();

  const keywords = [
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

  const keywordMatch =
    keywords.some((key) =>
      title.includes(key),
    );

  const metricMatch =
    sets.some(
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

  return (
    keywordMatch ||
    metricMatch
  );
}

// ============================================================
// CARDIO FORMAT
// ============================================================

function formatCardio(
  s: any,
) {
  const meters =
    s.distance_meters ??
    s.distanceMeters ??
    s.distance ??
    (s.km != null
      ? s.km * 1000
      : null);

  const km =
    meters != null
      ? `${(meters / 1000).toFixed(2)} km`
      : null;

  const totalSeconds =
    s.duration_seconds ??
    s.durationSeconds ??
    s.duration ??
    s.time;

  let time: string | null =
    null;

  if (
    typeof totalSeconds ===
    "number"
  ) {
    const hours =
      Math.floor(
        totalSeconds / 3600,
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600) /
          60,
      );

    const seconds =
      totalSeconds % 60;

    if (hours > 0) {
      time = `${hours}h ${minutes}min`;
    } else if (
      minutes > 0
    ) {
      time = `${minutes}min`;
    } else {
      time = `${seconds}s`;
    }
  } else if (
    typeof totalSeconds ===
    "string"
  ) {
    time = totalSeconds;
  }

  return (
    [time, km]
      .filter(Boolean)
      .join(" • ") ||
    "Completed"
  );
}

// ============================================================
// WEIGHT
// ============================================================

function formatWeight(
  s: any,
  exerciseTitle: string,
) {
  const raw =
    s.weightLbs ??
    s.weight_lbs ??
    s.weightKg ??
    s.weight_kg;

  if (raw == null) {
    return "BW";
  }

  const title =
    exerciseTitle.toLowerCase();

  const lbsExercise =
    (title.includes("cable") &&
      !title.includes(
        "lat pulldown",
      )) ||
    title.includes("pushdown") ||
    title.includes("fly");

  if (
    s.weightLbs != null ||
    s.weight_lbs != null
  ) {
    const lbs =
      s.weightLbs ??
      s.weight_lbs;

    return `${
      Math.round(lbs * 2) / 2
    }lbs`;
  }

  if (lbsExercise) {
    const lbs =
      Math.round(
        raw * 2.20462 * 2,
      ) / 2;

    return `${lbs}lbs`;
  }

  const kg =
    Number.isInteger(raw)
      ? raw
      : Math.round(raw * 10) / 10;

  return `${kg}kg`;
}

// ============================================================
// HASH
// ============================================================

function hashString(
  input: string,
) {
  let hash = 2166136261;

  for (
    let i = 0;
    i < input.length;
    i++
  ) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(
      hash,
      16777619,
    );
  }

  return (
    hash >>> 0
  )
    .toString(16)
    .padStart(8, "0");
}

function getWorkoutId(
  workout: HevyWorkout,
) {
  const fingerprint =
    JSON.stringify({
      title:
        workout.title
          ?.trim()
          .toLowerCase() ??
        "",
      startTime:
        workout.startTime ??
        "",
      exercises:
        workout.exercises.map(
          (exercise) => ({
            title:
              exercise.title
                ?.trim()
                .toLowerCase() ??
              "",
            notes:
              exercise.notes ??
              "",
            sets:
              exercise.sets.map(
                (set: any) => ({
                  weightKg:
                    set.weightKg ??
                    set.weight_kg ??
                    null,
                  weightLbs:
                    set.weightLbs ??
                    set.weight_lbs ??
                    null,
                  reps:
                    set.reps ??
                    null,
                  rpe:
                    set.rpe ??
                    null,
                  distance:
                    set.distance_meters ??
                    set.distanceMeters ??
                    null,
                  duration:
                    set.duration_seconds ??
                    set.durationSeconds ??
                    null,
                }),
              ),
          }),
        ),
    });

  return `hevy_${hashString(
    fingerprint,
  )}`;
}

// ============================================================
// DATE
// ============================================================

function parseWorkoutDate(
  rawDate:
    | string
    | null
    | undefined,
) {
  if (!rawDate) return 0;

  const value =
    rawDate.trim();

  const uk =
    value.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/,
    );

  if (uk) {
    const [
      ,
      day,
      month,
      year,
      hour = "0",
      minute = "0",
    ] = uk;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).getTime();
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? 0
    : date.getTime();
}

// ============================================================
// STORED HISTORY
// ============================================================

function getStoredHevyHistory(): StoredHevyWorkout[] {
  if (
    typeof window ===
    "undefined"
  ) {
    return [];
  }

  try {
    const raw =
      localStorage.getItem(
        "p35_hevy_workouts",
      );

    if (!raw) {
      hevyHistoryRawCache =
        null;
      hevyHistoryParsedCache =
        [];
      return [];
    }

    if (
      raw ===
      hevyHistoryRawCache
    ) {
      return hevyHistoryParsedCache;
    }

    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      hevyHistoryRawCache =
        raw;
      hevyHistoryParsedCache =
        [];
      return [];
    }

    const filtered =
      parsed.filter(
        (item): item is StoredHevyWorkout =>
          !!item &&
          typeof item ===
            "object" &&
          typeof (
            item as StoredHevyWorkout
          ).title ===
            "string" &&
          Array.isArray(
            (
              item as StoredHevyWorkout
            ).exercises,
          ),
      );

    hevyHistoryRawCache =
      raw;

    hevyHistoryParsedCache =
      filtered;

    return filtered;
  } catch {
    return [];
  }
}

// ============================================================
// RECENT HISTORY
// ============================================================

function getRecentHevyHistory(
  currentWorkout:
    | HevyWorkout
    | null = null,
) {
  const stored =
    getStoredHevyHistory();

  const cutoff =
    Date.now() -
    WORKOUT_HISTORY_DAYS *
      24 *
      60 *
      60 *
      1000;

  const withIds =
    stored.map(
      (item) => ({
        ...item,
        id:
          item.id ??
          getWorkoutId(item),
      }),
    );

  const recent =
    withIds.filter(
      (item) => {
        const time =
          parseWorkoutDate(
            item.startTime,
          );

        return (
          time > 0 &&
          time >= cutoff
        );
      },
    );

  if (currentWorkout) {
    const id =
      getWorkoutId(
        currentWorkout,
      );

    if (
      !recent.some(
        (item) =>
          item.id === id,
      )
    ) {
      recent.push({
        ...currentWorkout,
        id,
      });
    }
  }

  return recent.sort(
    (a, b) =>
      parseWorkoutDate(
        a.startTime,
      ) -
      parseWorkoutDate(
        b.startTime,
      ),
  );
}

// ============================================================
// EXERCISE DESCRIPTION
// ============================================================

function describeExercise(
  exercise:
    HevyWorkout["exercises"][number],
) {
  if (
    isCardioExercise(
      exercise.title,
      exercise.sets,
    )
  ) {
    const summary =
      exercise.sets
        .map(formatCardio)
        .join(", ");

    const notes =
      exercise.notes
        ? ` | Notes: "${exercise.notes}"`
        : "";

    return `- ${exercise.title} (Cardio/Conditioning): ${summary}${notes}`;
  }

  const sets =
    exercise.sets
      .map((set: any) => {
        const weight =
          formatWeight(
            set,
            exercise.title,
          );

        const rpe =
          set.rpe != null
            ? ` @RPE${set.rpe}`
            : "";

        return `${weight} x ${
          set.reps ?? "?"
        }${rpe}`;
      })
      .join(", ");

  const lastSet =
    exercise.sets[
      exercise.sets.length - 1
    ];

  const finalRpe =
    lastSet?.rpe != null
      ? ` | Final set RPE: ${lastSet.rpe}`
      : "";

  const notes =
    exercise.notes
      ? ` | Notes: "${exercise.notes}"`
      : "";

  const setNotes =
    lastSet?.notes
      ? ` | Set notes: "${lastSet.notes}"`
      : "";

  return `- ${exercise.title}: ${sets}${finalRpe}${notes}${setNotes}`;
}

// ============================================================
// HISTORY CONTEXT
// ============================================================

function buildHistoryLines(
  workout:
    | HevyWorkout
    | null,
) {
  const history =
    getRecentHevyHistory(
      workout,
    );

  const currentId =
    workout
      ? getWorkoutId(workout)
      : null;

  const lines: string[] = [
    "",
    `HEVY WORKOUT HISTORY: ${history.length} session(s) from the last ${WORKOUT_HISTORY_DAYS} days.`,
  ];

  if (
    history.length === 0
  ) {
    lines.push(
      "No recent Hevy workout history stored yet.",
    );
  }

  for (
    const session of history
  ) {
    const id =
      session.id ??
      getWorkoutId(session);

    lines.push(
      "",
      `${
        currentId === id
          ? "CURRENT WORKOUT"
          : "HISTORICAL WORKOUT"
      } — ID: ${id}`,
      `Title: "${session.title}"`,
      `Date/time: ${
        session.startTime ??
        "unknown"
      }`,
      ...session.exercises.map(
        describeExercise,
      ),
    );
  }

  if (
    workout &&
    currentId
  ) {
    lines.push(
      "",
      `IMPORTANT: The CURRENT WORKOUT for this request is ID ${currentId}.`,
      "Analyse this exact session when requested. Historical sessions are comparison data only.",
    );
  }

  return lines;
}

// ============================================================
// LIVE CONTEXT
// ============================================================

function buildContext(
  workout:
    | HevyWorkout
    | null,
  entries: WeightEntry[],
) {
  const block =
    getActiveBlockCountdown();

  const sorted =
    [...entries].sort(
      (a, b) =>
        a.date.localeCompare(
          b.date,
        ),
    );

  const trend =
    sorted
      .slice(-6)
      .map(
        (entry) =>
          `${entry.date}: ${entry.weight} lb`,
      )
      .join(", ") ||
    "no weigh-ins logged yet";

  const latest =
    sorted[
      sorted.length - 1
    ]?.weight;

  const lines = [
    `CURRENT BLOCK: ${block.phaseTitle} • ${block.blockName} (Week ${block.currentWeek} of ${block.totalWeeks})`,
    `Block Focus: ${block.goal}`,
    `Bodyweight Target: ${getGoalWeight()} lbs (Latest logged: ${latest ?? "unknown"} lbs | Trend: ${trend})`,
    `Daily Nutrition/Habit Standards: ${DAILY_TARGETS.caloriesMin}–${DAILY_TARGETS.caloriesMax} kcal, ${DAILY_TARGETS.protein}g+ protein, ${DAILY_TARGETS.steps} steps daily.`,
    `Long-Term ${getLongTermTarget()}`,
  ];

  const history =
    buildHistoryLines(
      workout,
    );

  lines.push(
    ...history,
  );

  return lines.join(
    "\n",
  );
}

// ============================================================
// ROUTINES
// ============================================================

function getRecentRoutines() {
  const history =
    getRecentHevyHistory();

  if (
    history.length === 0
  ) {
    return [];
  }

  const sorted =
    [...history].sort(
      (a, b) =>
        parseWorkoutDate(
          b.startTime,
        ) -
        parseWorkoutDate(
          a.startTime,
        ),
    );

  const titles: string[] =
    [];

  for (
    const session of sorted
  ) {
    const title =
      session.title?.trim();

    if (
      title &&
      !titles.includes(title)
    ) {
      titles.push(title);
    }
  }

  return titles;
}

// ============================================================
// FETCH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    return await fetch(
      input,
      {
        ...init,
        signal:
          controller.signal,
      },
    );
  } finally {
    window.clearTimeout(
      timeout,
    );
  }
}

// ============================================================
// GEMINI
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
  const recentHistory =
    history.slice(
      -MAX_CHAT_MESSAGES_SENT,
    );

  const contents = [
    ...recentHistory.map(
      (message) => ({
        role:
          message.role ===
          "assistant"
            ? "model"
            : "user",
        parts: [
          {
            text:
              typeof message.content ===
              "string"
                ? message.content
                : String(
                    message.content ??
                      "",
                  ),
          },
        ],
      }),
    ),
    {
      role: "user",
      parts: [
        {
          text: newPrompt,
        },
      ],
    },
  ];

  const payload = {
    systemInstruction: {
      parts: [
        {
          text:
            SYSTEM_INSTRUCTIONS +
            "\n\nATHLETE PROFILE & LIVE METRICS:\n" +
            systemContext,
        },
      ],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
    },
  };

  let rankedModels:
    string[];

  try {
    const available =
      await getCachedAvailableModels(
        apiKey,
      );

    rankedModels =
      rankModels(
        available,
      );
  } catch {
    rankedModels =
      [...PREFERRED_MODELS];
  }

  if (
    rankedModels.length === 0
  ) {
    rankedModels =
      [...PREFERRED_MODELS];
  }

  let lastError =
    "Gemini request failed.";

  for (
    const model of rankedModels
  ) {
    if (
      isModelCoolingDown(
        apiKey,
        model,
      )
    ) {
      continue;
    }

    try {
      const response =
        await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-goog-api-key":
                apiKey,
            },
            body:
              JSON.stringify(
                payload,
              ),
          },
          MODEL_REQUEST_TIMEOUT_MS,
        );

      const data =
        await response
          .json()
          .catch(
            () => ({}),
          );

      if (
        response.ok
      ) {
        const text =
          data.candidates?.[0]?.content?.parts
            ?.map(
              (part: any) =>
                typeof part?.text ===
                "string"
                  ? part.text
                  : "",
            )
            .join("")
            .trim() || "";

        if (text) {
          clearModelCooldown(
            apiKey,
            model,
          );

          return {
            text,
            model,
          };
        }

        lastError =
          `${model} returned an empty response.`;

        continue;
      }

      lastError =
        data.error?.message ||
        `HTTP ${response.status} from ${model}`;

      if (
        response.status ===
          401 ||
        response.status ===
          403
      ) {
        throw new Error(
          lastError,
        );
      }

      if (
        response.status ===
        429
      ) {
        markModelCooldown(
          apiKey,
          model,
        );

        continue;
      }
    } catch (error) {
      if (
        error instanceof
          DOMException &&
        error.name ===
          "AbortError"
      ) {
        lastError =
          `${model} timed out after ${MODEL_REQUEST_TIMEOUT_MS / 1000}s.`;

        continue;
      }

      lastError =
        error instanceof Error
          ? error.message
          : "Network error";

      if (
        lastError.includes(
          "API key",
        ) ||
        lastError.includes(
          "401",
        ) ||
        lastError.includes(
          "403",
        )
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    `All Gemini models failed. Last error: ${lastError}`,
  );
}

// ============================================================
// COACH TEXT
// ============================================================

function CoachText({
  text,
}: {
  text: unknown;
}) {
  const safeText =
    typeof text ===
    "string"
      ? text
      : text == null
        ? ""
        : String(text);

  const lines =
    safeText
      .replace(
        /---/g,
        "",
      )
      .split(
        /\r?\n/,
      )
      .map(
        (line) =>
          line.trim(),
      )
      .filter(Boolean);

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-white">
      {lines.map(
        (line, index) => {
          const clean =
            line
              .replace(
                /^#{1,4}\s+/,
                "",
              )
              .replace(
                /^[•*–-]\s+/,
                "",
              )
              .trim();

          const isHeader =
            /^#{1,4}\s+/.test(
              line,
            ) ||
            (/^(\*\*\d+\.|\*\*)[^*]+?\*\*$/.test(
              clean,
            ) &&
              !clean.includes(
                ":",
              )) ||
            (/^[A-Z][A-Za-z0-9\s()/-]+:$/.test(
              clean,
            ) &&
              !clean
                .toLowerCase()
                .startsWith(
                  "logged",
                ) &&
              !clean
                .toLowerCase()
                .startsWith(
                  "assessment",
                ) &&
              !clean
                .toLowerCase()
                .startsWith(
                  "next session",
                ) &&
              !clean
                .toLowerCase()
                .startsWith(
                  "athlete notes",
                ));

          const isBullet =
            !isHeader &&
            /^[•*–-]\s+/.test(
              line,
            );

          if (isHeader) {
            return (
              <div
                key={index}
                className="pt-2 pb-0.5 first:pt-0"
              >
                <h4 className="font-bold text-white text-sm tracking-tight">
                  {clean
                    .replace(
                      /\*\*/g,
                      "",
                    )
                    .replace(
                      /:$/,
                      "",
                    )}
                </h4>
              </div>
            );
          }

          return (
            <p
              key={index}
              className={
                isBullet
                  ? "pl-3 flex items-start gap-2 font-medium text-white"
                  : "font-normal text-white"
              }
            >
              {isBullet && (
                <span className="text-primary mt-1 shrink-0 select-none">
                  •
                </span>
              )}

              <span className="flex-1 text-white">
                {clean
                  .split(
                    /(\*\*[^*]+\*\*)/g,
                  )
                  .map(
                    (
                      part,
                      partIndex,
                    ) =>
                      part.startsWith(
                        "**",
                      ) &&
                      part.endsWith(
                        "**",
                      ) ? (
                        <strong
                          key={
                            partIndex
                          }
                          className="text-primary font-semibold"
                        >
                          {part.slice(
                            2,
                            -2,
                          )}
                        </strong>
                      ) : (
                        <span
                          key={
                            partIndex
                          }
                          className="text-white"
                        >
                          {
                            part
                          }
                        </span>
                      ),
                  )}
              </span>
            </p>
          );
        },
      )}
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
  const [open, setOpen] =
    useState(false);

  const {
    messages,
    add,
  } =
    useCoachMessages(
      userId,
    );

  const recentRoutines =
    useMemo(
      () =>
        getRecentRoutines(),
      [workout],
    );

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    lastFailedPrompt,
    setLastFailedPrompt,
  ] =
    useState<string | null>(
      null,
    );

  const [apiKey, setApiKey] =
    useState(() =>
      typeof window !==
      "undefined"
        ? localStorage.getItem(
            "p35_gemini_api_key",
          ) || ""
        : "",
    );

  const [
    draftApiKey,
    setDraftApiKey,
  ] =
    useState(apiKey);

  const [
    keyDialogOpen,
    setKeyDialogOpen,
  ] =
    useState(false);

  const [
    activeModel,
    setActiveModel,
  ] =
    useState<string | null>(
      null,
    );

  const endRef =
    useRef<HTMLDivElement>(
      null,
    );

  const textareaRef =
    useRef<HTMLTextAreaElement>(
      null,
    );

  // ============================================================
  // INPUT
  // ============================================================

  const handleInputResize =
    useCallback(
      (
        e: React.ChangeEvent<HTMLTextAreaElement>,
      ) => {
        const value =
          e.target.value;

        setInput(value);

        e.target.style.height =
          "auto";

        e.target.style.height =
          `${Math.min(
            e.target.scrollHeight,
            120,
          )}px`;
      },
      [],
    );

  // ============================================================
  // SCROLL
  // ============================================================

  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(
      () => {
        const el =
          endRef.current;

        if (!el) return;

        el.scrollIntoView({
          behavior: "auto",
          block: "end",
        });
      },
    );
  }, [
    open,
    messages.length,
    loading,
  ]);

  // ============================================================
  // KEY
  // ============================================================

  const saveGeminiKey =
    useCallback(
      (key: string) => {
        const clean =
          key.trim();

        localStorage.setItem(
          "p35_gemini_api_key",
          clean,
        );

        setApiKey(clean);
        setDraftApiKey(clean);
        setKeyDialogOpen(
          false,
        );

        toast.success(
          clean
            ? "Gemini key saved."
            : "Gemini key removed.",
        );
      },
      [],
    );

  // ============================================================
  // SEND
  // ============================================================

  const send =
    useCallback(
      async (
        text: string,
      ) => {
        const trimmed =
          text.trim();

        if (
          !trimmed ||
          loading
        ) {
          return;
        }

        const storedKey =
          localStorage.getItem(
            "p35_gemini_api_key",
          ) || "";

        const cleanKey =
          storedKey.replace(
            /\s+/g,
            "",
          );

        if (!cleanKey) {
          setKeyDialogOpen(
            true,
          );

          toast.error(
            "Add your Gemini API key first.",
          );

          return;
        }

        if (
          cleanKey !== apiKey
        ) {
          setApiKey(
            cleanKey,
          );
        }

        setInput("");

        if (
          textareaRef.current
        ) {
          textareaRef.current.style.height =
            "auto";
        }

        setLoading(true);
        setLastFailedPrompt(
          null,
        );

        const currentHistory =
          [...messages];

        // --------------------------------------------------------
        // Build everything BEFORE the request.
        // --------------------------------------------------------

        const context =
          buildContext(
            workout,
            entries,
          );

        // --------------------------------------------------------
        // IMPORTANT:
        // Gemini starts immediately.
        //
        // We no longer wait for the user-message database write
        // before starting the AI request.
        // --------------------------------------------------------

        const geminiPromise =
          callGemini(
            cleanKey,
            currentHistory,
            trimmed,
            context,
          );

        // Persistence happens independently.
        //
        // This means cloud/database latency is no longer added
        // directly to the AI response time.
        const saveUserPromise =
          add.mutateAsync({
            role: "user",
            content: trimmed,
          });

        try {
          const [
            geminiResult,
          ] = await Promise.all([
            geminiPromise,
            saveUserPromise,
          ]);

          const safeReply =
            typeof geminiResult.text ===
            "string"
              ? geminiResult.text
              : String(
                  geminiResult.text ??
                    "",
                );

          setActiveModel(
            geminiResult.model,
          );

          // ------------------------------------------------------
          // Persist assistant message without making the user
          // wait for another network round-trip.
          // ------------------------------------------------------

          void add
            .mutateAsync({
              role: "assistant",
              content:
                safeReply,
            })
            .catch((error) => {
              console.error(
                "Failed to save coach response:",
                error,
              );
            });
        } catch (error) {
          console.error(
            "Coach request failed:",
            error,
          );

          toast.error(
            error instanceof
              Error
              ? error.message
              : "Coach is unavailable.",
          );

          setLastFailedPrompt(
            trimmed,
          );

          // Ensure the user message isn't silently lost if
          // Gemini failed before persistence completed.
          void saveUserPromise.catch(
            (saveError) =>
              console.error(
                "Failed to save user message:",
                saveError,
              ),
          );
        } finally {
          setLoading(false);
        }
      },
      [
        loading,
        apiKey,
        messages,
        workout,
        entries,
        add,
      ],
    );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={setOpen}
      >
        <SheetTrigger asChild>
          <Button
            size="icon"
            aria-label="Open Coach AI"
            className="glow-ring fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 size-14 rounded-full"
          >
            <MessageSquare className="size-6" />
          </Button>
        </SheetTrigger>

        <SheetContent
          side="bottom"
          className="flex h-[88vh] flex-col gap-0 p-0"
        >
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                {COACH_NAME}
              </SheetTitle>

              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setKeyDialogOpen(
                    true,
                  )
                }
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
            {messages.length ===
              0 &&
              !loading && (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Ask anything about your lifts, exercise swaps, upcoming phases, or tap the button below for a full session breakdown.
                </p>
              )}

            {messages.map(
              (
                message,
                index,
              ) => {
                const isLastAssistant =
                  message.role ===
                    "assistant" &&
                  index ===
                    messages.length -
                      1;

                const content =
                  typeof message.content ===
                  "string"
                    ? message.content
                    : String(
                        message.content ??
                          "",
                      );

                return (
                  <div
                    key={index}
                    className="space-y-1"
                  >
                    <div
                      className={
                        message.role ===
                        "user"
                          ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                          : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface-2/70 px-4 py-2.5 text-sm"
                      }
                    >
                      {message.role ===
                      "assistant" ? (
                        <CoachText
                          text={
                            content
                          }
                        />
                      ) : (
                        <div className="whitespace-pre-wrap">
                          {
                            content
                          }
                        </div>
                      )}
                    </div>

                    {isLastAssistant &&
                      activeModel && (
                        <div className="flex items-center gap-1 pl-2 text-[10px] text-muted-foreground/60">
                          <Cpu className="size-2.5" />
                          <span>
                            {
                              activeModel
                            }
                          </span>
                        </div>
                      )}
                  </div>
                );
              },
            )}

            {loading && (
              <div className="mr-auto flex items-center gap-2 rounded-2xl border border-border bg-surface-2/70 px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Thinking...
              </div>
            )}

            {lastFailedPrompt &&
              !loading && (
                <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                  <span>
                    Request failed. Tap retry when ready.
                  </span>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 border-rose-500/40 text-rose-300 hover:bg-rose-500/20"
                    onClick={() =>
                      void send(
                        lastFailedPrompt,
                      )
                    }
                  >
                    <RefreshCw className="size-3.5" />
                    Retry
                  </Button>
                </div>
              )}

            <div ref={endRef} />
          </div>

          <div className="space-y-2 border-t border-border bg-surface-2/40 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {recentRoutines.length >
              0 && (
              <div className="space-y-1.5 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Today's Session Targets:
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {recentRoutines.map(
                    (
                      routine,
                    ) => (
                      <Button
                        key={
                          routine
                        }
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-border bg-surface-2/60 px-2.5 text-xs hover:border-primary hover:text-primary"
                        disabled={
                          loading
                        }
                        onClick={() =>
                          void send(
                            `I'm about to do "${routine}". Find the last time I logged this specific routine in my workout history, pull the exercises with their previous weights and RPE, and give me my targets and progression calls for today.`,
                          )
                        }
                      >
                        {
                          routine
                        }
                      </Button>
                    ),
                  )}
                </div>
              </div>
            )}

            <Button
              variant="secondary"
              className="w-full"
              disabled={loading}
              onClick={() =>
                void send(
                  "Please analyse my last Hevy workout against current block targets. Evaluate RPE for each exercise, provide promote/stick/deload calls, and build my next session plan.",
                )
              }
            >
              <Sparkles className="mr-2 size-4" />
              Analyse Last Session
            </Button>

            <form
              className="flex items-end gap-2 rounded-xl border border-border bg-surface-2 p-2 transition-colors focus-within:border-primary"
              onSubmit={(event) => {
                event.preventDefault();

                void send(
                  input,
                );
              }}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={
                  handleInputResize
                }
                placeholder="Ask about a lift, swap, or current phase..."
                className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              />

              <Button
                type="submit"
                size="icon"
                className="mb-0.5 size-10 shrink-0"
                disabled={
                  loading ||
                  !input.trim()
                }
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={keyDialogOpen}
        onOpenChange={
          setKeyDialogOpen
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Gemini API Key
            </DialogTitle>

            <DialogDescription>
              Stored locally on your device. Get a free API key from Google AI Studio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="gemini-key">
              API Key
            </Label>

            <Input
              id="gemini-key"
              type="password"
              placeholder="Paste AI Studio API key"
              value={
                draftApiKey
              }
              onChange={(event) =>
                setDraftApiKey(
                  event.target
                    .value,
                )
              }
            />
          </div>

          <DialogFooter className="gap-2">
            {apiKey && (
              <Button
                variant="ghost"
                onClick={() =>
                  saveGeminiKey(
                    "",
                  )
                }
              >
                Remove key
              </Button>
            )}

            <Button
              onClick={() =>
                saveGeminiKey(
                  draftApiKey,
                )
              }
            >
              Save key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
