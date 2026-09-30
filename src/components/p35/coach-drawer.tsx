import { useEffect, useRef, useState } from "react";
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
  Notebook,
} from "lucide-react";
import { toast } from "sonner";
import { APP_NAME, IS_PROJECT_35 } from "@/lib/config";

type Msg = CoachMsg;

// ============================================================
// AI COACH SYSTEM INSTRUCTIONS
// ============================================================

const SYSTEM_INSTRUCTIONS = `You are the ${APP_NAME} performance coach: direct, knowledgeable, conversational, and technically sharp.

CONTEXT & TONE:
- Your name is Coach Clive.
- You are my coach. You can call me ${IS_PROJECT_35 ? "Ryan, Chief, Boss or mate" : "Chief, Boss or mate"} but only if it really calls for it. In general conversation refrain from using a name; keep it precise and to the point and only use names if it explicitly needs it.
- You are an expert strength and conditioning partner helping the athlete progress across their current macrocycle toward the long-term target supplied in the athlete data below.
- Match the user's intent. If they greet you ("hey", "hello"), respond naturally and ask what they want to tackle today.
- If they ask general questions about exercise swaps, pain management, recovery, upcoming phases, or pacing, provide direct, intelligent advice grounded in their current block targets without forcing rigid templates.
- Strictly respect the exact unit logged by the user for lifts (whether lbs or kg) and pounds for bodyweight. Never convert or translate their logged weight units. Keep responses crisp and actionable.

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
//
// These are ranked preferences only.
// The API is ALWAYS asked what models the current API key
// actually has access to before any model is attempted.
//

const PREFERRED_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

// ============================================================
// CARDIO DETECTION
// ============================================================

function isCardioExercise(
  exerciseTitle: string,
  sets: any[],
): boolean {
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

  const matchesKeyword = cardioKeywords.some((k) =>
    title.includes(k),
  );

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

  const kmString =
    meters != null
      ? `${(meters / 1000).toFixed(2)} km`
      : null;

  const totalSec =
    s.duration_seconds ??
    s.durationSeconds ??
    s.duration ??
    s.time;

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

  return parts.length > 0
    ? parts.join(" • ")
    : "Completed";
}

// ============================================================
// WEIGHT FORMATTER
// ============================================================

function formatWeight(
  s: any,
  exerciseTitle: string,
) {
  const rawWeight =
    s.weightLbs ??
    s.weight_lbs ??
    s.weightKg ??
    s.weight_kg;

  if (rawWeight == null) {
    return "BW";
  }

  const titleLower = exerciseTitle.toLowerCase();

  // FIX: Explicitly exclude lat pulldown from the cable conversion
  const isCableOrLbs =
    (titleLower.includes("cable") && !titleLower.includes("lat pulldown")) ||
    titleLower.includes("pushdown") ||
    titleLower.includes("fly");

  if (
    s.weightLbs != null ||
    s.weight_lbs != null
  ) {
    const val =
      s.weightLbs ?? s.weight_lbs;

    const snapped =
      Math.round(val * 2) / 2;

    return `${snapped}lbs`;
  }

  if (isCableOrLbs) {
    const rawLbs =
      rawWeight * 2.20462;

    const snappedLbs =
      Math.round(rawLbs * 2) / 2;

    return `${snappedLbs}lbs`;
  }

  const roundedKg =
    Number.isInteger(rawWeight)
      ? rawWeight
      : Math.round(rawWeight * 10) / 10;

  return `${roundedKg}kg`;
}

// ============================================================
// STORED HEVY HISTORY (Ascension context)
// ============================================================

type StoredHevyWorkout = HevyWorkout & { id?: string };

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
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is StoredHevyWorkout =>
        !!item &&
        typeof item === "object" &&
        typeof (item as StoredHevyWorkout).title === "string" &&
        Array.isArray((item as StoredHevyWorkout).exercises),
    );
  } catch {
    return [];
  }
}

function describeExercise(ex: HevyWorkout["exercises"][number]): string {
  if (isCardioExercise(ex.title, ex.sets)) {
    const cardioSummary = ex.sets
      .map((s: any) => formatCardio(s))
      .join(", ");
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
  const rpeStr =
    lastSet?.rpe != null ? ` | Final set RPE: ${lastSet.rpe}` : "";
  const notesStr = ex.notes ? ` | Notes: "${ex.notes}"` : "";
  const setNotesStr = lastSet?.notes
    ? ` | Set notes: "${lastSet.notes}"`
    : "";

  return `- ${ex.title}: ${setStr}${rpeStr}${notesStr}${setNotesStr}`;
}

function buildHistoryLines(workout: HevyWorkout | null): string[] {
  const sortedHistory = getStoredHevyHistory()
    .map((item) => ({ ...item, id: item.id ?? getWorkoutId(item) }))
    .sort(
      (a, b) => parseWorkoutDate(a.startTime) - parseWorkoutDate(b.startTime),
    );

  let currentWorkoutId: string | null = null;

  if (workout) {
    currentWorkoutId = getWorkoutId(workout);

    if (!sortedHistory.some((item) => item.id === currentWorkoutId)) {
      sortedHistory.push({ ...workout, id: currentWorkoutId });
    }
  }

  const recentHistory = sortedHistory.slice(-10);
  const lines: string[] = [
    "",
    `HEVY WORKOUT HISTORY: ${recentHistory.length} stored session(s).`,
  ];

  if (recentHistory.length === 0) {
    lines.push("No Hevy workout history stored yet.");
  }

  for (const historyWorkout of recentHistory) {
    const id = historyWorkout.id ?? getWorkoutId(historyWorkout);

    lines.push(
      "",
      `${currentWorkoutId === id ? "CURRENT WORKOUT" : "HISTORICAL WORKOUT"} — ID: ${id}`,
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
) {
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

  // Provide full session history regardless of project build
  const history = buildHistoryLines(workout);
  if (history.length > 2) {
    lines.push(...history);
  } else if (workout) {
    lines.push(
      `LATEST WORKOUT LOGGED IN HEVY: "${workout.title}" on ${workout.startTime ?? "recent"}.`,
      ...workout.exercises.map(describeExercise),
    );
  } else {
    lines.push("No Hevy workout synced yet.");
  }

  return lines.join("\n");
}

// ============================================================
// EXTRACT RECENT UNIQUE SPLITS
// ============================================================

function getRecentRoutines(): string[] {
  const history = getStoredHevyHistory();
  if (!history || history.length === 0) return [];

  // Sort newest first
  const sorted = [...history].sort(
    (a, b) => parseWorkoutDate(b.startTime) - parseWorkoutDate(a.startTime),
  );

  // Look across recent sessions and deduplicate routine titles
  const titles: string[] = [];
  for (const session of sorted.slice(0, 10)) {
    const rawTitle = session.title?.trim();
    if (rawTitle && !titles.includes(rawTitle)) {
      titles.push(rawTitle);
    }
  }

  return titles;
}

// ============================================================
// DISCOVER AVAILABLE GEMINI MODELS
// ============================================================

async function getAvailableModels(
  apiKey: string,
): Promise<string[]> {
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

    if (pageToken) {
      query.set(
        "pageToken",
        pageToken,
      );
    }

    const listUrl =
      `https://generativelanguage.googleapis.com/v1beta/models?${query.toString()}`;

    const listRes = await fetch(
      listUrl,
      {
        method: "GET",
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );

    const listData =
      await listRes
        .json()
        .catch(() => ({}));

    if (!listRes.ok) {
      throw new Error(
        listData.error?.message ||
          `Unable to list Gemini models (HTTP ${listRes.status}).`,
      );
    }

    if (
      Array.isArray(
        listData.models,
      )
    ) {
      availableModels.push(
        ...listData.models,
      );
    }

    pageToken =
      listData.nextPageToken || "";
  } while (pageToken);

  const modelIds =
    availableModels
      .filter(
        (model) =>
          Array.isArray(
            model.supportedGenerationMethods,
          ),
      )
      .filter((model) =>
        model.supportedGenerationMethods!.includes(
          "generateContent",
        ),
      )
      .map((model) => {
        if (model.baseModelId) {
          return model.baseModelId;
        }

        if (model.name) {
          return model.name.replace(
            /^models\//,
            "",
          );
        }

        return "";
      })
      .filter(Boolean);

  return Array.from(
    new Set(modelIds),
  );
}

// ============================================================
// FILTER TO TEXT CHAT MODELS
// ============================================================
//
// Some APIs can expose models which technically support
// generateContent but are not appropriate for this text coach.
//

function isUsableCoachModel(
  model: string,
): boolean {
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

  return !excludedPatterns.some(
    (pattern) =>
      lower.includes(pattern),
  );
}

// ============================================================
// RANK MODELS
// ============================================================

function rankModels(
  availableModels: string[],
): string[] {
  const usableModels =
    availableModels.filter(
      isUsableCoachModel,
    );

  const preferred =
    PREFERRED_MODELS.filter(
      (model) =>
        usableModels.includes(model),
    );

  const otherModels =
    usableModels.filter(
      (model) =>
        !PREFERRED_MODELS.includes(
          model,
        ),
    );

  return [
    ...preferred,
    ...otherModels,
  ];
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
  const recentHistory =
    history.slice(-10);

  const contents = [
    ...recentHistory.map(
      (m) => ({
        role:
          m.role === "assistant"
            ? "model"
            : "user",
        parts: [
          {
            text: m.content,
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

  console.log(
    "Discovering Gemini models available to API key...",
  );

  const availableModels =
    await getAvailableModels(
      apiKey,
    );

  console.log(
    "Gemini models supporting generateContent:",
    availableModels,
  );

  if (
    availableModels.length === 0
  ) {
    throw new Error(
      "This Gemini API key has no available models that support generateContent.",
    );
  }

  const rankedModels =
    rankModels(
      availableModels,
    );

  console.log(
    "Gemini coach fallback order:",
    rankedModels,
  );

  if (
    rankedModels.length === 0
  ) {
    throw new Error(
      "This Gemini API key has no usable text-generation models available.",
    );
  }

  let lastErrorMsg =
    "Gemini request failed.";

  for (const model of rankedModels) {
    try {
      console.log(
        `Trying Gemini model: ${model}`,
      );

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const res = await fetch(
        url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            "x-goog-api-key": apiKey,
          },

          body: JSON.stringify(
            payload,
          ),
        },
      );

      const data =
        await res
          .json()
          .catch(() => ({}));

      if (res.ok) {
        const text =
          data.candidates?.[0]?.content?.parts
            ?.map(
              (part: any) =>
                part.text || "",
            )
            .join("")
            .trim() || "";

        if (text) {
          console.log(
            `Gemini success using ${model}`,
          );

          return {
            text,
            model,
          };
        }

        lastErrorMsg =
          `Model ${model} returned an empty response.`;

        console.warn(
          lastErrorMsg,
        );

        continue;
      }

      lastErrorMsg =
        data.error?.message ||
        `HTTP ${res.status} from ${model}`;

      console.warn(
        `Gemini model ${model} failed:`,
        lastErrorMsg,
      );
    } catch (err) {
      lastErrorMsg =
        err instanceof Error
          ? err.message
          : "Network error";

      console.warn(
        `Gemini model ${model} threw an error:`,
        lastErrorMsg,
      );
    }
  }

  throw new Error(
    `All available Gemini models failed. Last error: ${lastErrorMsg}`,
  );
}

// ============================================================
// FORMATTED AI MESSAGE
// ============================================================
//
// This is deliberately based on the richer formatter from
// your working onboarding screen rather than the simpler
// CoachText version you currently have.
//

function CoachText({
  text,
}: {
  text: string;
}) {
  const cleanedText = text
    .replace(/---/g, "")
    .replace(
      /([.!?])\s+(\*\*\d+\.)/g,
      "$1\n\n$2",
    )
    .replace(
      /\s+\*\s+(\*\*)/g,
      "\n\n• $1",
    )
    .replace(
      /\s+-\s+(\*\*)/g,
      "\n\n• $1",
    );

  const lines = cleanedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map(
        (line, idx) => {
          const subItems = line
            .split(
              /(?=\*\*\d+\.)|\s+\*\s+(?=\*\*)/,
            )
            .map((s) =>
              s.trim(),
            )
            .filter(Boolean);

          return (
            <div
              key={idx}
              className="space-y-1.5"
            >
              {subItems.map(
                (
                  sub,
                  sIdx,
                ) => {
                  const isNumberedHeader =
                    /^\*\*\d+\./.test(
                      sub,
                    );

                  const isBullet =
                    sub.startsWith(
                      "* ",
                    ) ||
                    sub.startsWith(
                      "- ",
                    ) ||
                    sub.startsWith(
                      "• ",
                    );

                  // PATCHED REGEX: Safely strips spaces, dashes, and single asterisks, but ignores double asterisks
                  const cleanSub =
                    sub.replace(
                      /^(?:[•–-\s]+|\*(?!\*)\s*)+/,
                      "",
                    );

                  return (
                    <p
                      key={sIdx}
                      className={
                        isNumberedHeader
                          ? "font-bold text-foreground mt-3 mb-1"
                          : isBullet
                            ? "pl-3 flex items-start gap-2 font-medium"
                            : "font-normal"
                      }
                    >
                      {isBullet && (
                        <span className="text-primary mt-1">
                          •
                        </span>
                      )}

                      <span className="flex-1">
                        {cleanSub
                          .split(
                            /(\*\*[^*]+\*\*)/g,
                          )
                          .map(
                            (
                              part,
                              i,
                            ) =>
                              part.startsWith(
                                "**",
                              ) &&
                              part.endsWith(
                                "**",
                              ) ? (
                                <strong
                                  key={
                                    i
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
                                    i
                                  }
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
  const [open, setOpen] = useState(false);
  
  // Extract unique routines for the dynamic split picker
  const recentRoutines = getRecentRoutines();

  const {
    messages,
    add,
  } =
    useCoachMessages(userId);

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
    useState(
      () =>
        localStorage.getItem(
          "p35_gemini_api_key",
        ) || "",
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
  // TEXTAREA RESIZE
  // ============================================================

  const handleInputResize = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInput(
      e.target.value,
    );

    const target =
      e.target;

    target.style.height =
      "auto";

    target.style.height =
      `${Math.min(
        target.scrollHeight,
        120,
      )}px`;
  };

  // ============================================================
  // AUTO-SCROLL
  // ============================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer =
      setTimeout(() => {
        endRef.current?.scrollIntoView(
          {
            behavior: "auto",
          },
        );
      }, 50);

    return () =>
      clearTimeout(timer);
  }, [
    open,
    messages.length,
  ]);

  useEffect(() => {
    if (
      typeof document ===
        "undefined" ||
      !document.body ||
      !endRef.current
    ) {
      return;
    }

    endRef.current.scrollIntoView(
      {
        behavior: "smooth",
      },
    );
  }, [
    messages,
    loading,
  ]);

  // ============================================================
  // SAVE GEMINI KEY
  // ============================================================

  const saveGeminiKey = (
    key: string,
  ) => {
    const clean =
      key.trim();

    localStorage.setItem(
      "p35_gemini_api_key",
      clean,
    );

    setApiKey(clean);

    setDraftApiKey(
      clean,
    );

    setKeyDialogOpen(
      false,
    );

    toast.success(
      clean
        ? "Gemini key saved."
        : "Gemini key removed.",
    );
  };

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const send = async (
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

    const currentKey =
      localStorage.getItem(
        "p35_gemini_api_key",
      ) || "";

    const cleanKey =
      currentKey.replace(
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

    // Keep state synchronised in case the key was
    // changed in localStorage elsewhere.
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

    try {
      const currentHistory =
        [...messages];

      await add.mutateAsync(
        {
          role: "user",
          content:
            trimmed,
        },
      );

      const {
        text: reply,
        model,
      } =
        await callGemini(
          cleanKey,
          currentHistory,
          trimmed,
          buildContext(
            workout,
            entries,
          ),
        );

      setActiveModel(
        model,
      );

      await add.mutateAsync(
        {
          role: "assistant",
          content:
            reply,
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Coach is unavailable.";

      console.error(
        "Coach request failed:",
        error,
      );

      toast.error(
        errorMessage,
      );

      setLastFailedPrompt(
        trimmed,
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={
          setOpen
        }
      >
        <SheetTrigger
          asChild
        >
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
                Coach Clive
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

          {/* ==================================================
              MESSAGE AREA
          ================================================== */}

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.length ===
              0 &&
              !loading && (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Ask anything about your lifts, exercise swaps, upcoming phases, or tap the button below for a full session breakdown.
                </p>
              )}

            {messages.map(
              (m, i) => {
                const isLastAssistant =
                  m.role ===
                    "assistant" &&
                  i ===
                    messages.length -
                      1;

                return (
                  <div
                    key={i}
                    className="space-y-1"
                  >
                    <div
                      className={
                        m.role ===
                        "user"
                          ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                          : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface-2/70 px-4 py-2.5 text-sm"
                      }
                    >
                      {m.role ===
                      "assistant" ? (
                        <CoachText
                          text={
                            m.content
                          }
                        />
                      ) : (
                        <div className="whitespace-pre-wrap">
                          {
                            m.content
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

            {/* ==================================================
                THINKING INDICATOR
            ================================================== */}

            {loading && (
              <div className="mr-auto flex items-center gap-2 rounded-2xl border border-border bg-surface-2/70 px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Thinking...
              </div>
            )}

            {/* ==================================================
                RETRY
            ================================================== */}

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

            <div
              ref={endRef}
            />
          </div>

          {/* ==================================================
              INPUT AREA
          ================================================== */}

          <div className="space-y-2 border-t border-border bg-surface-2/40 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            
            {/* DYNAMIC SPLIT PICKER */}
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
                          `I'm about to do "${routine}". Find the last time I logged this specific routine in my workout history, pull the exercises with their previous weights and RPE, and give me my targets and progression calls for today.`
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
              <Sparkles className="size-4 mr-2" />
              Analyse Last Session
            </Button>

            <form
              className="flex items-end gap-2 rounded-xl border border-border bg-surface-2 p-2 transition-colors focus-within:border-primary"
              onSubmit={(e) => {
                e.preventDefault();
                void send(
                  input,
                );
              }}
            >
              <textarea
                ref={
                  textareaRef
                }
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

      {/* ======================================================
          API KEY DIALOG
      ====================================================== */}

      <Dialog
        open={
          keyDialogOpen
        }
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
              Stored locally on your device. Get a free API key from Google AI Studio
              (aistudio.google.com).
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
              onChange={(
                e,
              ) =>
                setDraftApiKey(
                  e.target
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
