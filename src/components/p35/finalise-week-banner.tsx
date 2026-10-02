import { memo, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getActiveBlockDetails,
  getActiveHabits,
  getProgramWeekNumber,
  todayKey,
  DAILY_TARGETS,
  getGoalWeight,
} from "@/lib/project35";
import { APP_NAME, IS_PROJECT_35 } from "@/lib/config";
import { triggerFridayBackup } from "@/lib/p35-cloud";
import {
  CalendarCheck,
  Camera,
  Loader2,
  Sparkles,
  Trophy,
  Check,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getMondayKeyForDate } from "./WeeklyProtocolCard";

// ============================================================
// GEMINI MODEL CONFIGURATION
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
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

const MODEL_COOLDOWN_MS = 60_000;
const MODEL_REQUEST_TIMEOUT_MS = 8_000;

const modelDiscoveryCache = new Map<string, Promise<string[]>>();
const modelCooldownCache = new Map<string, Map<string, number>>();
const lastSuccessfulModelCache = new Map<string, string>();

function getModelCooldowns(apiKey: string): Map<string, number> {
  let cooldowns = modelCooldownCache.get(apiKey);

  if (!cooldowns) {
    cooldowns = new Map<string, number>();
    modelCooldownCache.set(apiKey, cooldowns);
  }

  return cooldowns;
}

function isModelCoolingDown(apiKey: string, model: string): boolean {
  const cooldowns = modelCooldownCache.get(apiKey);
  if (!cooldowns) return false;

  const until = cooldowns.get(model);

  if (!until) return false;

  if (Date.now() >= until) {
    cooldowns.delete(model);
    return false;
  }

  return true;
}

function cooldownModel(apiKey: string, model: string) {
  getModelCooldowns(apiKey).set(
    model,
    Date.now() + MODEL_COOLDOWN_MS,
  );
}

function isUsableModel(model: string): boolean {
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

  return !excludedPatterns.some((pattern) =>
    lower.includes(pattern),
  );
}

function rankModels(availableModels: string[]): string[] {
  const usableModels = availableModels.filter(isUsableModel);

  const preferred = PREFERRED_MODELS.filter((model) =>
    usableModels.includes(model),
  );

  const otherModels = usableModels.filter(
    (model) => !PREFERRED_MODELS.includes(model),
  );

  return [...preferred, ...otherModels];
}

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

    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?${query.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.error?.message || "Unable to list models.",
      );
    }

    if (Array.isArray(data.models)) {
      availableModels.push(...data.models);
    }

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  const modelIds = availableModels
    .filter(
      (model) =>
        Array.isArray(model.supportedGenerationMethods) &&
        model.supportedGenerationMethods.includes("generateContent"),
    )
    .map(
      (model) =>
        model.baseModelId ||
        (model.name
          ? model.name.replace(/^models\//, "")
          : ""),
    )
    .filter(Boolean);

  return Array.from(new Set(modelIds));
}

function getCachedAvailableModels(
  apiKey: string,
): Promise<string[]> {
  const cached = modelDiscoveryCache.get(apiKey);

  if (cached) {
    return cached;
  }

  const promise = getAvailableModels(apiKey).catch((error) => {
    modelDiscoveryCache.delete(apiKey);
    throw error;
  });

  modelDiscoveryCache.set(apiKey, promise);

  return promise;
}

function getInitialModelOrder(apiKey: string): string[] {
  const lastSuccessful = lastSuccessfulModelCache.get(apiKey);

  const models = lastSuccessful
    ? [lastSuccessful, ...PREFERRED_MODELS]
    : [...PREFERRED_MODELS];

  const uniqueModels = Array.from(new Set(models));

  return uniqueModels.filter(
    (model) => !isModelCoolingDown(apiKey, model),
  );
}

async function fetchGeminiWithTimeout(
  apiKey: string,
  model: string,
  payload: unknown,
): Promise<{
  response: Response;
  data: any;
}> {
  const controller = new AbortController();

  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, MODEL_REQUEST_TIMEOUT_MS);

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    return {
      response,
      data,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function generateGeminiSummary(
  apiKey: string,
  payload: unknown,
): Promise<{
  text: string;
  model: string;
}> {
  const attemptedModels = new Set<string>();
  let lastError = "No usable Gemini model responded.";

  const lastSuccessful = lastSuccessfulModelCache.get(apiKey);

  /*
   * If we don't already know a working model, begin discovery in
   * the background. It does NOT block the first generation attempt.
   */
  let discoveryPromise: Promise<string[]> | null = null;

  if (!lastSuccessful) {
    discoveryPromise = getCachedAvailableModels(apiKey).catch(
      () => [],
    );
  }

  const initialModels = getInitialModelOrder(apiKey);

  for (const model of initialModels) {
    if (attemptedModels.has(model)) continue;

    attemptedModels.add(model);

    try {
      const { response, data } =
        await fetchGeminiWithTimeout(
          apiKey,
          model,
          payload,
        );

      if (response.ok) {
        const text =
          data.candidates?.[0]?.content?.parts
            ?.map((part: any) => part.text || "")
            .join("")
            .trim() || "";

        if (text) {
          lastSuccessfulModelCache.set(apiKey, model);

          console.log(
            `[AI Weekly Summary] Generated using ${model}`,
          );

          return {
            text,
            model,
          };
        }

        lastError = `${model} returned an empty response.`;
        continue;
      }

      const status = response.status;
      const message =
        data.error?.message ||
        `HTTP ${status}`;

      lastError = message;

      /*
       * Authentication errors are not model-specific.
       * Trying another model won't fix an invalid key.
       */
      if (status === 401 || status === 403) {
        throw new Error(message);
      }

      /*
       * Rate limits should immediately fall through to the
       * next model.
       */
      if (status === 429) {
        cooldownModel(apiKey, model);

        console.warn(
          `[AI Weekly Summary] ${model} rate limited. Falling back immediately.`,
        );

        continue;
      }

      /*
       * Invalid/unavailable model.
       * Forget it if it was previously our known-good model.
       */
      if (status === 404) {
        if (
          lastSuccessfulModelCache.get(apiKey) === model
        ) {
          lastSuccessfulModelCache.delete(apiKey);
        }

        continue;
      }

      /*
       * Bad requests can also mean an unsupported model/config.
       * Continue rather than killing the whole synthesis.
       */
      if (status === 400) {
        continue;
      }

      /*
       * Other server errors also fall through.
       */
      if (status >= 500) {
        cooldownModel(apiKey, model);

        console.warn(
          `[AI Weekly Summary] ${model} server error. Falling back.`,
          message,
        );

        continue;
      }

      console.warn(
        `[AI Weekly Summary] ${model} failed:`,
        message,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Network error.";

      lastError = message;

      /*
       * AbortError means our timeout fired.
       * Don't repeatedly hit a model that is hanging.
       */
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        cooldownModel(apiKey, model);

        console.warn(
          `[AI Weekly Summary] ${model} timed out after ${MODEL_REQUEST_TIMEOUT_MS}ms. Falling back.`,
        );

        continue;
      }

      /*
       * Some browsers/environments may throw a regular Error
       * rather than DOMException for an aborted fetch.
       */
      if (
        message.toLowerCase().includes("abort") ||
        message.toLowerCase().includes("timeout")
      ) {
        cooldownModel(apiKey, model);

        console.warn(
          `[AI Weekly Summary] ${model} timed out. Falling back.`,
        );

        continue;
      }

      /*
       * Network failure. Try the next model rather than
       * making the entire weekly summary fail.
       */
      console.warn(
        `[AI Weekly Summary] ${model} network failure:`,
        message,
      );
    }
  }

  /*
   * Preferred models all failed.
   *
   * If discovery was already running, it should usually be
   * ready by now. If we already had a known-good model, start
   * discovery only at this point.
   */
  if (!discoveryPromise) {
    discoveryPromise = getCachedAvailableModels(apiKey).catch(
      () => [],
    );
  }

  const discoveredModels = await discoveryPromise;
  const rankedDiscoveredModels =
    rankModels(discoveredModels);

  for (const model of rankedDiscoveredModels) {
    if (attemptedModels.has(model)) continue;
    if (isModelCoolingDown(apiKey, model)) continue;

    attemptedModels.add(model);

    try {
      const { response, data } =
        await fetchGeminiWithTimeout(
          apiKey,
          model,
          payload,
        );

      if (response.ok) {
        const text =
          data.candidates?.[0]?.content?.parts
            ?.map((part: any) => part.text || "")
            .join("")
            .trim() || "";

        if (text) {
          lastSuccessfulModelCache.set(apiKey, model);

          console.log(
            `[AI Weekly Summary] Generated using discovered model ${model}`,
          );

          return {
            text,
            model,
          };
        }

        lastError = `${model} returned an empty response.`;
        continue;
      }

      const status = response.status;
      const message =
        data.error?.message ||
        `HTTP ${status}`;

      lastError = message;

      if (status === 401 || status === 403) {
        throw new Error(message);
      }

      if (status === 429) {
        cooldownModel(apiKey, model);
        continue;
      }

      if (status === 404) {
        if (
          lastSuccessfulModelCache.get(apiKey) === model
        ) {
          lastSuccessfulModelCache.delete(apiKey);
        }

        continue;
      }

      if (status >= 500) {
        cooldownModel(apiKey, model);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Network error.";

      lastError = message;

      if (
        message.toLowerCase().includes("abort") ||
        message.toLowerCase().includes("timeout")
      ) {
        cooldownModel(apiKey, model);
      }
    }
  }

  throw new Error(
    `Synthesis generation failed. ${lastError}`,
  );
}

// ============================================================
// COACH SYSTEM PROMPT
// ============================================================

function getCoachSystemPrompt() {
  const { activePhase, activeBlock } =
    getActiveBlockDetails();

  return `You are the ${APP_NAME} performance coach: direct, no-fluff, and technically sharp.
Rules:
- Celebrate only earned wins, briefly. No hype, no filler, no emoji.
- Athlete Phase Context: Phase ${activePhase.id} (${activePhase.title}) — ${activeBlock.name}. Focus: ${activeBlock.focus.join(", ")}. Phase Summary: ${activePhase.summary}
- Live Targets: ${DAILY_TARGETS.caloriesMin.toLocaleString()}–${DAILY_TARGETS.caloriesMax.toLocaleString()} kcal, ${DAILY_TARGETS.protein}g+ protein, ${DAILY_TARGETS.steps.toLocaleString()} steps daily, routine standard: "${DAILY_TARGETS.routine}", target benchmark: ${getGoalWeight()} lbs.
- UNIT FIDELITY: Mirror the exact units logged in the Hevy payload (kg or lbs). Pounds for bodyweight.
- MANDATORY FORMATTING: You must output the review using EXACTLY four headers. Do not change them. Do not generate empty bullet points. Keep answers under 350 words.`;
}

// ============================================================
// FORMATTED AI OUTPUT
// ============================================================

const FormattedSynthesis = memo(
  function FormattedSynthesis({
    text,
  }: {
    text: string;
  }) {
    return (
      <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
        {text.split("\n").map((line, i) => {
          const trimmed = line.trim();

          if (!trimmed) return null;

          if (
            trimmed.startsWith("**") &&
            trimmed.endsWith("**") &&
            !trimmed.slice(2, -2).includes("**")
          ) {
            return (
              <p
                key={i}
                className="font-bold text-primary pt-3 first:pt-0 text-sm"
              >
                {trimmed.slice(2, -2)}
              </p>
            );
          }

          const formattedLine = trimmed.replace(
            /\*\*(.*?)\*\*/g,
            "$1",
          );

          const isBullet =
            formattedLine.startsWith("*") ||
            formattedLine.startsWith("-");

          const cleanText = isBullet
            ? formattedLine.replace(/^[*-\s]+/, "• ")
            : formattedLine;

          return (
            <p
              key={i}
              className={
                isBullet
                  ? "pl-2 font-medium text-foreground/90"
                  : ""
              }
            >
              {cleanText}
            </p>
          );
        })}
      </div>
    );
  },
);

// ============================================================
// COMPONENT
// ============================================================

export function FinaliseWeekBanner({
  userId,
}: {
  userId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [hasGenerated, setHasGenerated] =
    useState(false);

  const [summaryData, setSummaryData] = useState<{
    isSunday: boolean;
    isMonday: boolean;
    isOverdue: boolean;
    evaluationDateStr: string;
    isPhotoWeek: boolean;
    isPhotoCleared: boolean;
    isPhotoPending: boolean;
    totalPossible: number;
    totalCompleted: number;
    overallPercentage: number;
    habitBreakdown: {
      label: string;
      completed: number;
      total: number;
    }[];
    weeklyProtocolGoals: {
      id: string;
      text: string;
      completed: boolean;
      status?:
        | "completed"
        | "failed"
        | "pending";
      targetCount?: number;
      completedCount?: number;
      notes?: string;
    }[];
    weightHistory: {
      date: string;
      weight: number;
    }[];
    journals: string[];
    hevyWorkouts: string[];
    aiSummary: string;
    hasRequiredWeighIn: boolean;
    isFinalised: boolean;
  } | null>(null);

  // ============================================================
  // WEEK CALCULATION
  // ============================================================

  const calculateWeekData = useCallback(() => {
    const todayStr = todayKey();
    const realTodayObj = new Date(
      todayStr + "T00:00:00Z",
    );

    const dayOfWeek = realTodayObj.getUTCDay();

    const isSunday = dayOfWeek === 0;
    const isMonday = dayOfWeek === 1;

    let evaluationDateObj = realTodayObj;

    if (isMonday) {
      evaluationDateObj = new Date(
        realTodayObj.getTime() -
          24 * 60 * 60 * 1000,
      );
    }

    const evaluationDateStr =
      evaluationDateObj
        .toISOString()
        .slice(0, 10);

    const weekKey =
      `p35_finalised_week_${evaluationDateStr}`;

    const lastLocked =
      localStorage.getItem(
        "p35_last_locked_week",
      );

    const isFinalised =
      localStorage.getItem(weekKey) !== null ||
      lastLocked === evaluationDateStr;

    let hasWeighedIn = false;

    let weightHistory: {
      date: string;
      weight: number;
    }[] = [];

    const validWeekDates = new Set<string>();

    try {
      const rawWeights = userId
        ? localStorage.getItem(
            `p35_weigh_ins_${userId}`,
          ) ||
          localStorage.getItem("p35_weigh_ins")
        : localStorage.getItem(
            "p35_weigh_ins",
          );

      if (rawWeights) {
        const parsedEntries =
          JSON.parse(rawWeights);

        if (Array.isArray(parsedEntries)) {
          hasWeighedIn = parsedEntries.some(
            (e: any) =>
              e.date === evaluationDateStr,
          );

          weightHistory = parsedEntries
            .sort(
              (a, b) =>
                new Date(b.date).getTime() -
                new Date(a.date).getTime(),
            )
            .slice(0, 5);
        }
      }
    } catch (err) {
      console.error(
        "Failed to check weigh-in history:",
        err,
      );
    }

    const hasRequiredWeighIn = isMonday
      ? true
      : hasWeighedIn;

    const mondayKey =
      getMondayKeyForDate(
        evaluationDateStr,
      );

    const rawProtocol =
      localStorage.getItem(
        `p35_weekly_protocol_${mondayKey}`,
      );

    const weeklyProtocolGoals = rawProtocol
      ? JSON.parse(rawProtocol).map(
          (g: any) => ({
            ...g,
            status:
              g.status ||
              (g.completed
                ? "completed"
                : "pending"),
          }),
        )
      : [];

    const currentWeekNumber =
      getProgramWeekNumber(
        evaluationDateObj,
      );

    const isPhotoWeek =
      evaluationDateObj.getUTCDay() === 0 &&
      currentWeekNumber % 4 === 0;

    const isPhotoCleared =
      localStorage.getItem(
        `p35_photo_cleared_week_${currentWeekNumber}`,
      ) === "true";

    const isPhotoPending =
      localStorage.getItem(
        "p35_photo_checkpoint_pending",
      ) === "true";

    const habitStats: Record<
      string,
      {
        label: string;
        completed: number;
        total: number;
        expectedTotal: number;
      }
    > = {};

    let totalPossibleChecks = 0;
    let totalCompletedChecks = 0;

    const journals: string[] = [];
    const hevyWorkouts: string[] = [];

    // ============================================================
    // 7-DAY HABIT/JOURNAL DATA
    // ============================================================

    for (let i = 6; i >= 0; i--) {
      const d = new Date(
        evaluationDateObj,
      );

      d.setUTCDate(
        evaluationDateObj.getUTCDate() - i,
      );

      const k = d
        .toISOString()
        .slice(0, 10);

      validWeekDates.add(k);

      const loopDayOfWeek =
        d.getUTCDay();

      const isWeekend =
        loopDayOfWeek === 0 ||
        loopDayOfWeek === 6;

      const dayHabits =
        getActiveHabits(d);

      const rawHabits =
        localStorage.getItem(
          `p35_habits_${k}`,
        );

      let parsedHabits: Record<
        string,
        boolean
      > = {};

      if (rawHabits) {
        try {
          parsedHabits =
            JSON.parse(rawHabits);
        } catch {
          // Ignore malformed daily habit data.
        }
      }

      dayHabits.forEach((h) => {
        if (h.key.startsWith("weekend_")) {
          return;
        }

        const labelLower =
          h.label.toLowerCase();

        const isWeekdayOnly =
          h.key === "early_morning" ||
          h.key === "workout_complete" ||
          labelLower.includes(
            "6:00 am",
          ) ||
          labelLower.includes(
            "early morning",
          );

        if (
          isWeekend &&
          isWeekdayOnly
        ) {
          return;
        }

        if (!habitStats[h.key]) {
          const expectedTotal =
            isWeekdayOnly ? 5 : 7;

          habitStats[h.key] = {
            label: h.label,
            completed: 0,
            total: expectedTotal,
            expectedTotal,
          };
        }

        if (parsedHabits[h.key]) {
          habitStats[h.key].completed++;
        }
      });

      const rawJournal =
        localStorage.getItem(
          `p35_journal_${k}`,
        );

      if (
        rawJournal &&
        rawJournal.trim()
      ) {
        journals.push(
          `${k}: ${rawJournal.trim()}`,
        );
      }
    }

    // ============================================================
    // HEVY DATA
    // ============================================================

    try {
      const allHevyRaw =
        localStorage.getItem(
          "p35_hevy_workouts",
        ) ||
        localStorage.getItem(
          "hevy_cache",
        );

      if (allHevyRaw) {
        const parsedHevy =
          JSON.parse(allHevyRaw);

        const workoutsArray =
          Array.isArray(parsedHevy)
            ? parsedHevy
            : parsedHevy.workouts ||
              [];

        workoutsArray.forEach(
          (w: any) => {
            const workoutDate =
              w.start_time?.slice(
                0,
                10,
              ) ||
              w.startTime?.slice(
                0,
                10,
              );

            if (
              workoutDate &&
              validWeekDates.has(
                workoutDate,
              )
            ) {
              const exSummary =
                w.exercises
                  ?.map(
                    (ex: any) => {
                      const setsSummary =
                        ex.sets
                          ?.map(
                            (s: any) => {
                              const weight =
                                s.weightKg ??
                                s.weightLbs ??
                                s.weight ??
                                "BW";

                              const unit =
                                s.weightLbs !=
                                null
                                  ? "lbs"
                                  : "kg";

                              return `${weight}${unit}x${s.reps}`;
                            },
                          )
                          .join(", ");

                      return `${ex.title} (${setsSummary})`;
                    },
                  )
                  .join(" | ");

              hevyWorkouts.push(
                `${workoutDate}: ${w.title} - ${exSummary}`,
              );
            }
          },
        );
      }
    } catch (e) {
      console.warn(
        "Failed to parse Hevy workouts for synthesis",
        e,
      );
    }

    // ============================================================
    // SCORING
    // ============================================================

    const finalizedBreakdown =
      Object.values(habitStats).map(
        (stat) => {
          const completed = Math.min(
            stat.completed,
            stat.expectedTotal,
          );

          return {
            label: stat.label,
            completed,
            total:
              stat.expectedTotal,
          };
        },
      );

    totalPossibleChecks =
      finalizedBreakdown.reduce(
        (acc, curr) =>
          acc + curr.total,
        0,
      );

    totalCompletedChecks =
      finalizedBreakdown.reduce(
        (acc, curr) =>
          acc + curr.completed,
        0,
      );

    const corePercentage =
      totalPossibleChecks > 0
        ? (totalCompletedChecks /
            totalPossibleChecks) *
          100
        : 0;

    let protocolPercentage = 0;

    if (
      weeklyProtocolGoals.length > 0
    ) {
      let totalProtocolTicks = 0;
      let completedProtocolTicks = 0;

      weeklyProtocolGoals.forEach(
        (g: any) => {
          const target =
            g.targetCount &&
            g.targetCount > 0
              ? g.targetCount
              : 1;

          const done =
            g.completedCount ??
            (g.completed
              ? target
              : 0);

          totalProtocolTicks +=
            target;

          completedProtocolTicks +=
            done;
        },
      );

      protocolPercentage =
        totalProtocolTicks > 0
          ? (completedProtocolTicks /
              totalProtocolTicks) *
            100
          : 0;
    }

    const finalScore =
      weeklyProtocolGoals.length > 0
        ? corePercentage * 0.9 +
          protocolPercentage * 0.1
        : corePercentage;

    // ============================================================
    // PRESERVE EXISTING AI SUMMARY
    // ============================================================

    setSummaryData((prev) => {
      const currentAiSummary =
        prev?.aiSummary;

      const keepExisting =
        currentAiSummary &&
        currentAiSummary !==
          "Tap below to generate your AI weekly journal synthesis and performance verdict.";

      return {
        isSunday,
        isMonday,
        isOverdue:
          isMonday && !isFinalised,
        evaluationDateStr,
        isPhotoWeek,
        isPhotoCleared,
        isPhotoPending,
        totalPossible:
          totalPossibleChecks,
        totalCompleted:
          totalCompletedChecks,
        overallPercentage: Math.min(
          100,
          Math.max(
            0,
            Math.round(finalScore),
          ),
        ),
        habitBreakdown:
          finalizedBreakdown,
        weeklyProtocolGoals,
        weightHistory,
        journals,
        hevyWorkouts,
        aiSummary: keepExisting
          ? currentAiSummary
          : "Tap below to generate your AI weekly journal synthesis and performance verdict.",
        hasRequiredWeighIn,
        isFinalised,
      };
    });
  }, [userId]);

  useEffect(() => {
    calculateWeekData();

    window.addEventListener(
      "p35-photo-pending-updated",
      calculateWeekData,
    );

    return () =>
      window.removeEventListener(
        "p35-photo-pending-updated",
        calculateWeekData,
      );
  }, [calculateWeekData]);

  // ============================================================
  // AI WEEKLY SYNTHESIS
  // ============================================================

  const generateAiSummary = async () => {
    /*
     * Prevent accidental double requests.
     */
    if (loadingAi || !summaryData) {
      return;
    }

    const apiKey = localStorage
      .getItem("p35_gemini_api_key")
      ?.replace(/\s+/g, "");

    if (!apiKey) {
      toast.error(
        "Add your Gemini API key first.",
      );
      return;
    }

    setLoadingAi(true);

    try {
      // ========================================================
      // BUILD CONTEXT
      // ========================================================

      const journalText =
        summaryData.journals.length > 0
          ? summaryData.journals.join("\n")
          : "No daily journal notes recorded this week.";

      const hevyText =
        summaryData.hevyWorkouts.length > 0
          ? summaryData.hevyWorkouts.join("\n")
          : "No Hevy workouts logged this week.";

      const breakdownText =
        summaryData.habitBreakdown
          .map(
            (h) =>
              `- ${h.label}: ${h.completed}/${h.total}`,
          )
          .join("\n");

      const protocolText =
        summaryData.weeklyProtocolGoals
          .length > 0
          ? summaryData.weeklyProtocolGoals
              .map((g) => {
                const countText =
                  g.targetCount &&
                  g.targetCount > 0
                    ? ` (${g.completedCount || 0}/${g.targetCount})`
                    : "";

                const notesText = g.notes
                  ? ` - Notes/Reason: ${g.notes}`
                  : "";

                return `- "${g.text}" [Status: ${
                  (
                    g.status ||
                    (g.completed
                      ? "completed"
                      : "pending")
                  ).toUpperCase()
                }${countText}]${notesText}`;
              })
              .join("\n")
          : "No weekly execution focus targets logged.";

      const weightText =
        summaryData.weightHistory.length > 0
          ? summaryData.weightHistory
              .map(
                (w) =>
                  `- ${w.date}: ${w.weight} lbs`,
              )
              .join("\n")
          : "No weigh-ins logged recently.";

      const contextBundle = `Weekly Adherence: ${summaryData.overallPercentage}% (${summaryData.totalCompleted}/${summaryData.totalPossible} total checks).
Habit Breakdown:
${breakdownText}

Recent Bodyweight Log:
${weightText}

Weekly Execution Protocol Targets:
${protocolText}

Lifting Sessions (Hevy):
${hevyText}

Daily Journal Notes:
${journalText}`;

      const userPrompt = `Review my completed week based on the performance data, bodyweight trend, protocol targets, journal notes, and workout logs.
You MUST structure your response EXACTLY with these four markdown headers and nothing else:
**The Numbers**
**The Standard**
**The Iron**
**Next Action**
Do NOT output any empty bullet points. Do NOT alter the headers.`;

      /*
       * Build the system prompt once.
       * Previously this was effectively rebuilt as part of
       * every model attempt.
       */
      const systemPrompt =
        `${getCoachSystemPrompt()}\n\nATHLETE PROFILE & LIVE METRICS:\n${contextBundle}`;

      const payload = {
        systemInstruction: {
          parts: [
            {
              text: systemPrompt,
            },
          ],
        },

        contents: [
          {
            role: "user",
            parts: [
              {
                text: userPrompt,
              },
            ],
          },
        ],

        generationConfig: {
          temperature: 0.7,
        },
      };

      // ========================================================
      // FAST GEMINI REQUEST
      // ========================================================

      const result =
        await generateGeminiSummary(
          apiKey,
          payload,
        );

      /*
       * Keep the existing behaviour of showing the generated
       * synthesis immediately in the modal.
       */
      setHasGenerated(true);

      setSummaryData((prev) =>
        prev
          ? {
              ...prev,
              aiSummary: result.text,
            }
          : null,
      );
    } catch (err) {
      console.error(
        "AI weekly synthesis failed:",
        err,
      );

      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to generate AI weekly summary.",
      );
    } finally {
      setLoadingAi(false);
    }
  };

  // ============================================================
  // LOCK / ARCHIVE WEEK
  // ============================================================

  const handleLockInWeek = async () => {
    if (
      !summaryData ||
      !summaryData.hasRequiredWeighIn
    ) {
      return;
    }

    const lockDateStr =
      summaryData.evaluationDateStr;

    const currentWeekNumber =
      getProgramWeekNumber(
        new Date(
          lockDateStr +
            "T00:00:00Z",
        ),
      );

    const isCleared =
      localStorage.getItem(
        `p35_photo_cleared_week_${currentWeekNumber}`,
      ) === "true";

    if (
      currentWeekNumber % 4 === 0 &&
      !isCleared
    ) {
      localStorage.setItem(
        "p35_photo_checkpoint_pending",
        "true",
      );

      window.dispatchEvent(
        new Event(
          "p35-photo-pending-updated",
        ),
      );
    }

    const weekKey =
      `p35_finalised_week_${lockDateStr}`;

    const overallPct =
      summaryData.overallPercentage ?? 0;

    const {
      activePhase,
      activeBlock,
    } = getActiveBlockDetails();

    const mondayKey =
      getMondayKeyForDate(
        lockDateStr,
      );

    const formatShortDate = (
      dStr: string,
    ) =>
      new Date(
        dStr,
      ).toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "2-digit",
        },
      );

    // ============================================================
    // FULL LOCAL STORAGE BACKUP
    // ============================================================

    const fullBackupData: Record<
      string,
      string
    > = {};

    for (
      let i = 0;
      i < localStorage.length;
      i++
    ) {
      const key =
        localStorage.key(i);

      if (
        key &&
        key.startsWith("p35_") &&
        !key.startsWith(
          "p35_finalised_week_",
        )
      ) {
        fullBackupData[key] =
          localStorage.getItem(
            key,
          ) || "";
      }
    }

    const weekArchiveRecord = {
      date: lockDateStr,

      dateRange: `${formatShortDate(
        mondayKey,
      )} - ${formatShortDate(
        lockDateStr,
      )}`,

      phaseTitle: `Phase ${activePhase.id}: ${activePhase.title}`,

      blockName:
        activeBlock.name,

      overallPercentage:
        overallPct,

      totalCompleted:
        summaryData.totalCompleted ??
        0,

      totalPossible:
        summaryData.totalPossible ??
        0,

      breakdown:
        summaryData.habitBreakdown ??
        [],

      weeklyProtocolGoals:
        summaryData.weeklyProtocolGoals ??
        [],

      aiSynthesis:
        summaryData.aiSummary.includes(
          "Tap below to generate",
        )
          ? ""
          : summaryData.aiSummary,

      fullLocalStorageSnapshot:
        fullBackupData,
    };

    // ============================================================
    // SAVE ARCHIVE
    // ============================================================

    try {
      localStorage.setItem(
        weekKey,
        JSON.stringify(
          weekArchiveRecord,
        ),
      );

      localStorage.setItem(
        "p35_last_locked_week",
        lockDateStr,
      );
    } catch (err) {
      console.warn(
        "Storage quota exceeded. Saving without full snapshot.",
        err,
      );

      delete (
        weekArchiveRecord as any
      ).fullLocalStorageSnapshot;

      localStorage.setItem(
        weekKey,
        JSON.stringify(
          weekArchiveRecord,
        ),
      );

      localStorage.setItem(
        "p35_last_locked_week",
        lockDateStr,
      );
    }

    // ============================================================
    // CLOUD BACKUP
    // ============================================================

    try {
      await triggerFridayBackup(
        lockDateStr,
      );
    } catch (err) {
      console.error(
        "Cloud backup failed",
        err,
      );
    }

    // ============================================================
    // REFRESH UI
    // ============================================================

    setIsOpen(false);

    calculateWeekData();

    window.dispatchEvent(
      new Event(
        "p35-week-finalised",
      ),
    );

    if (overallPct < 50) {
      toast.error(
        `Week locked in at ${overallPct}%. Absolute shambles. Sort your shit out.`,
      );
    } else if (overallPct < 80) {
      toast.error(
        `Week locked in at ${overallPct}%. Decent base, but you left meat on the bone.`,
      );
    } else if (overallPct === 100) {
      toast.success(
        `Week locked in at 100%. Absolute clinic. Flawless execution.`,
      );
    } else {
      toast.success(
        `Week locked in at ${overallPct}%. Smashing it. Standard held.`,
      );
    }
  };

  // ============================================================
  // VISIBILITY
  // ============================================================

  if (!summaryData) {
    return null;
  }

  const hasAiSynthesis =
    IS_PROJECT_35 ||
    (
      summaryData.aiSummary.trim() !== "" &&
      !summaryData.aiSummary.includes(
        "Tap below to generate",
      )
    );

  if (
    !summaryData.isSunday &&
    !summaryData.isOverdue
  ) {
    return null;
  }

  const showPhotoBanner =
    (
      summaryData.isPhotoWeek &&
      !summaryData.isPhotoCleared
    ) ||
    summaryData.isPhotoPending;

  // ============================================================
  // UI
  // ============================================================

  return (
    <div
      className={`panel p-4 space-y-3 ${
        summaryData.isOverdue
          ? "border-amber-500/50 bg-amber-500/10"
          : summaryData.isFinalised
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-primary/40 bg-primary/10"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`grid size-9 shrink-0 place-items-center rounded-lg ${
              summaryData.isOverdue
                ? "bg-amber-500/20 text-amber-500"
                : summaryData.isFinalised
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-primary/20 text-primary"
            }`}
          >
            {summaryData.isOverdue ? (
              <AlertCircle className="size-5" />
            ) : summaryData.isFinalised ? (
              <Check className="size-5" />
            ) : (
              <CalendarCheck className="size-5" />
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">
              {summaryData.isOverdue
                ? "Overdue: Finalise Last Week"
                : summaryData.isFinalised
                  ? "Sunday: Week Finalised & Locked"
                  : "Sunday: Finalise Week"}
            </h3>

            <p className="text-xs text-muted-foreground">
              {summaryData.isOverdue
                ? "You missed Sunday's check-in. Review and lock in your week now."
                : summaryData.isFinalised
                  ? "Weekly audit complete and backed up. Refinalise anytime if adjustments are needed."
                  : "Review metrics, protocol targets, synthesize journals, and lock in."}
            </p>
          </div>
        </div>

        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);

            if (open) {
              calculateWeekData();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant={
                summaryData.isOverdue
                  ? "default"
                  : summaryData.isFinalised
                    ? "outline"
                    : "default"
              }
              className={`gap-1.5 shrink-0 ${
                summaryData.isOverdue
                  ? "bg-amber-500 text-black hover:bg-amber-400"
                  : ""
              }`}
            >
              <Sparkles className="size-4" />

              {summaryData.isOverdue
                ? "Finalise"
                : summaryData.isFinalised
                  ? "Refinalise"
                  : "Finalise"}
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="size-5 text-primary" />
                Weekly Performance Summary
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* ==================================================
                  PHOTO CHECKPOINT
              ================================================== */}

              {showPhotoBanner && (
                <div
                  className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
                    summaryData.isPhotoPending
                      ? "border-amber-500/50 bg-amber-500/5 animate-pulse"
                      : "border-amber-500/40 bg-amber-500/10"
                  }`}
                >
                  <Camera className="size-5 text-amber-500 shrink-0 mt-0.5" />

                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-amber-500">
                      {summaryData.isPhotoPending
                        ? "Outstanding Photo Checkpoint"
                        : "4-Week Photo Checkpoint Due"}
                    </p>

                    <p className="text-muted-foreground">
                      {summaryData.isPhotoPending
                        ? "You locked in without uploading photos. Upload your checkpoint photos in the Photos module to clear this requirement."
                        : "This is your 4-week rotation marker. Upload your checkpoint photos in the Photos module to clear this requirement."}
                    </p>
                  </div>
                </div>
              )}

              {/* ==================================================
                  OVERALL SCORE
              ================================================== */}

              <div className="rounded-lg border border-border bg-surface-2/60 p-4 text-center space-y-1">
                <p className="stat-label">
                  You were on form for
                </p>

                <p className="font-display text-3xl font-bold text-primary">
                  {summaryData.overallPercentage}%
                </p>

                <p className="text-xs text-muted-foreground">
                  of the week (
                  {summaryData.totalCompleted}/
                  {summaryData.totalPossible} total checks)
                </p>
              </div>

              {/* ==================================================
                  HABIT BREAKDOWN
              ================================================== */}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Non-Negotiables Breakdown
                </p>

                <div className="space-y-1.5 rounded-lg border border-border bg-surface-2/40 p-3">
                  {summaryData.habitBreakdown.map(
                    (h, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0"
                      >
                        <span className="text-foreground font-medium">
                          {h.label}
                        </span>

                        <span className="font-semibold text-primary">
                          {h.completed}/
                          {h.total}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>

              {/* ==================================================
                  WEEKLY PROTOCOL
              ================================================== */}

              {summaryData
                .weeklyProtocolGoals
                .length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Weekly Execution Protocol
                    </p>

                    <span className="text-[10px] text-muted-foreground italic">
                      Check dashboard to amend
                    </span>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
                    {summaryData.weeklyProtocolGoals.map(
                      (g) => {
                        const currentStatus =
                          g.status ||
                          (g.completed
                            ? "completed"
                            : "pending");

                        const current =
                          g.completedCount ||
                          0;

                        const total =
                          g.targetCount ||
                          0;

                        return (
                          <div
                            key={g.id}
                            className="flex flex-col gap-1 py-2 border-b border-border/40 last:border-0"
                          >
                            <span
                              className={`text-xs font-medium ${
                                currentStatus ===
                                "completed"
                                  ? "text-emerald-400"
                                  : currentStatus ===
                                      "failed"
                                    ? "text-rose-400 line-through opacity-80"
                                    : "text-foreground"
                              }`}
                            >
                              {g.text}
                            </span>

                            {g.notes && (
                              <span
                                className={`text-[11px] italic pl-2 border-l-2 ${
                                  currentStatus ===
                                  "failed"
                                    ? "border-rose-500/30 text-rose-300/80"
                                    : "border-primary/30 text-muted-foreground/80"
                                }`}
                              >
                                {currentStatus ===
                                "failed"
                                  ? `Reason: ${g.notes}`
                                  : `Notes: ${g.notes}`}
                              </span>
                            )}

                            <div className="flex items-center justify-between gap-2 mt-1">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  currentStatus ===
                                  "completed"
                                    ? "bg-emerald-500/25 text-emerald-300"
                                    : currentStatus ===
                                        "failed"
                                      ? "bg-rose-500/25 text-rose-300"
                                      : "bg-amber-500/25 text-amber-300"
                                }`}
                              >
                                {currentStatus ===
                                "completed"
                                  ? "Smashed"
                                  : currentStatus ===
                                      "failed"
                                    ? "Failed"
                                    : total >
                                        0
                                      ? `${current}/${total}`
                                      : "Pending"}
                              </span>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              )}

              {/* ==================================================
                  AI SYNTHESIS
              ================================================== */}

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="size-4" />
                    AI Weekly Journal Synthesis
                  </p>

                  {summaryData.aiSummary !==
                    "Tap below to generate your AI weekly journal synthesis and performance verdict." && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-primary gap-1"
                      onClick={
                        generateAiSummary
                      }
                      disabled={loadingAi}
                    >
                      {loadingAi ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}

                      Regenerate
                    </Button>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-surface-2/60 p-4 min-h-[100px]">
                  {summaryData.aiSummary ===
                  "Tap below to generate your AI weekly journal synthesis and performance verdict." ? (
                    <Button
                      variant="secondary"
                      className="w-full gap-2 text-primary"
                      onClick={
                        generateAiSummary
                      }
                      disabled={loadingAi}
                    >
                      {loadingAi ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}

                      {loadingAi
                        ? "Analyzing week..."
                        : "Generate AI Verdict"}
                    </Button>
                  ) : (
                    <FormattedSynthesis
                      text={
                        summaryData.aiSummary
                      }
                    />
                  )}
                </div>
              </div>

              {/* ==================================================
                  WEIGH-IN WARNING
              ================================================== */}

              {!summaryData.hasRequiredWeighIn &&
                !summaryData.isMonday && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">
                    ⚠️ You must log today's bodyweight on the dashboard before locking in the week.
                  </div>
                )}

              {/* ==================================================
                  AI REQUIREMENT
              ================================================== */}

              {!IS_PROJECT_35 &&
                !hasAiSynthesis && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-400">
                    Generate the AI synthesis before locking in the week.
                  </div>
                )}

              {/* ==================================================
                  LOCK BUTTON
              ================================================== */}

              <Button
                className="w-full font-bold mt-4"
                onClick={
                  handleLockInWeek
                }
                disabled={
                  !summaryData.hasRequiredWeighIn ||
                  !hasAiSynthesis
                }
              >
                {summaryData.isFinalised
                  ? "Refinalise & Update Archive"
                  : "Lock In Week & Archive"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}