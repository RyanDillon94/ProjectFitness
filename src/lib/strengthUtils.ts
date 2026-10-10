import {
  getMuscleGroupForExercise,
  getLegSubGroupForExercise,
  MuscleGroup,
  LegSubGroup,
  MUSCLE_GROUPS,
  LEG_MUSCLE_GROUPS,
} from "./strengthMapping";

export type WorkoutSet = {
  exerciseName: string;
  weight: number;
  reps: number;
  date: string; // YYYY-MM-DD
  /**
   * RPE for the set. It is normally only logged on an exercise's final set,
   * so most sets leave this empty. That is expected.
   */
  rpe?: number | null;
};

export type MuscleStatus =
  | "UP WEIGHT"
  | "BUILD REPS"
  | "SWEET SPOT"
  | "CEILING"
  | "MONITOR"
  | "DIAL BACK"
  | "NO DATA";

export type SignalConfidence = "high" | "medium" | "low";

export type MuscleSignal = {
  status: MuscleStatus;
  /** One-line explanation shown under the chip. */
  reason: string;
  confidence: SignalConfidence;
  /** How many of the muscle's recent sessions were found (0-2). */
  recentSessions: number;
  /** Volume-weighted change in final-set RPE vs each exercise's own baseline. */
  rpeChange: number | null;
  /** Volume-weighted average final-set RPE across the recent sessions. */
  recentRpe: number | null;
};

export type TopExercise = {
  exerciseName: string;
  currentE1RM: number;
  baselineE1RM: number;
  percentChange: number;
  trendVolume: number;
  isNew: boolean;
};

export type LegSubGroupSummary = {
  strengthChange: number;
  currentVolume: number;
  baselineVolume: number;
  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;
  currentVolume: number;
  baselineVolume: number;
  topExercises: TopExercise[];
  legSubGroups: Record<LegSubGroup, LegSubGroupSummary>;
  signal: MuscleSignal;
};

export type ProgressReport = {
  overallStrengthChange: number;
  muscleGroups: Record<MuscleGroup, MuscleGroupSummary>;
  weeklyTrend: any[];
};

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Rolling window of history that is considered at all. */
const WINDOW_DAYS = 60;
/** Maximum days since last performance for an exercise to count as "recent/active". */
const MAX_RECENT_SESSION_AGE_DAYS = 14;
/** "Recent" = the last N sessions that included the muscle group. */
const RECENT_SESSIONS_PER_MUSCLE = 2;

/** Muscle-level strength change (%) thresholds. */
const STRENGTH_UP_PCT = 1.5;
const STRENGTH_DOWN_PCT = -3.0;
/** Each of the two recent sessions must be at least this far down for DIAL BACK. */
const SESSION_DOWN_PCT = -2.0;

/** RPE thresholds (final-set RPE). */
const RPE_HARDER_DELTA = 1.0; // up this much vs the exercise's own baseline = "harder"
const RPE_LOW = 7.5; // average below this = "room to push"
const RPE_NEAR_FAILURE = 9.5; // fallback "harder" test when there is no baseline RPE
/** Share of recent exercises that need an RPE before RPE is trusted. */
const MIN_RPE_COVERAGE = 0.5;

/** A latest session after this many days off downgrades DIAL BACK to WATCH. */
const FIRST_SESSION_BACK_GAP_DAYS = 10;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type SessionEntry = {
  date: string;
  topE1rm: number; // best estimated 1RM of any set in the session
  volume: number;
  rpe: number | null; // RPE of the last set that had one (the final set)
};

type ExerciseHistory = {
  exerciseName: string;
  muscle: MuscleGroup;
  sessions: Map<string, SessionEntry>; // keyed by date
};

type ExerciseProgress = {
  exerciseName: string;
  muscle: MuscleGroup;
  legSubGroup: LegSubGroup | null;
  baseE1rm: number;
  recentE1rm: number;
  acuteVolume: number;
  chronicVolume: number;
  recentRpe: number | null;
  baseRpe: number | null;
  recentEntries: SessionEntry[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function calculateE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function calculateSetVolume(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * reps;
}

function normaliseRpe(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return n;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function daysBetween(laterDate: string, earlierDate: string): number {
  return Math.round((new Date(laterDate).getTime() - new Date(earlierDate).getTime()) / MS_PER_DAY);
}

function fmtPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function makeSignal(partial: Partial<MuscleSignal> & { status: MuscleStatus; reason: string }): MuscleSignal {
  return {
    confidence: "low",
    recentSessions: 0,
    rpeChange: null,
    recentRpe: null,
    ...partial,
  };
}

function createEmptyLegSubGroups(): Record<LegSubGroup, LegSubGroupSummary> {
  const result = {} as Record<LegSubGroup, LegSubGroupSummary>;
  LEG_MUSCLE_GROUPS.forEach((group) => {
    result[group] = {
      strengthChange: 0,
      currentVolume: 0,
      baselineVolume: 0,
      topExercises: [],
    };
  });
  return result;
}

function createEmptyMuscleGroups(): Record<MuscleGroup, MuscleGroupSummary> {
  const result = {} as Record<MuscleGroup, MuscleGroupSummary>;
  MUSCLE_GROUPS.forEach((group) => {
    result[group] = {
      strengthChange: 0,
      currentVolume: 0,
      baselineVolume: 0,
      topExercises: [],
      legSubGroups: createEmptyLegSubGroups(),
      signal: makeSignal({
        status: "NO DATA",
        reason: `No sessions logged in the last ${WINDOW_DAYS} days.`,
      }),
    };
  });
  return result;
}

function createTopExercise(data: ExerciseProgress): TopExercise {
  const hasCurrentActivity = data.acuteVolume > 0;
  const hasBaselineActivity = data.chronicVolume > 0;
  const isNew = hasCurrentActivity && !hasBaselineActivity;

  let strengthChange = 0;
  if (data.baseE1rm > 0 && data.recentE1rm > 0) {
    strengthChange = ((data.recentE1rm - data.baseE1rm) / data.baseE1rm) * 100;
  } else if (data.baseE1rm === 0 && data.recentE1rm > 0) {
    strengthChange = 100;
  } else if (data.baseE1rm > 0 && data.recentE1rm === 0) {
    strengthChange = -100;
  }

  const trendVolume = data.acuteVolume + data.chronicVolume;

  return {
    exerciseName: data.exerciseName,
    currentE1RM: round1(data.recentE1rm),
    baselineE1RM: round1(data.baseE1rm > 0 ? data.baseE1rm : data.recentE1rm),
    percentChange: round1(strengthChange),
    trendVolume: round1(trendVolume),
    isNew,
  };
}

// ---------------------------------------------------------------------------
// Status signal (strength + RPE)
// ---------------------------------------------------------------------------

type SignalInput = {
  strengthChange: number;
  comparable: boolean;
  /** The muscle's recent session dates, newest first (0-2 items). */
  recentDates: string[];
  /** Every session date for the muscle inside the window, newest first. */
  allDates: string[];
  recentRpe: number | null;
  rpeChange: number | null;
  rpeCoverage: number;
  /** Strength change of each recent session vs baseline (null if not comparable). */
  sessionChanges: Array<number | null>;
};

function buildSignal(input: SignalInput): MuscleSignal {
  const { strengthChange, comparable, recentDates, allDates, recentRpe, rpeChange, rpeCoverage, sessionChanges } = input;
  const recentSessions = recentDates.length;

  if (recentSessions === 0) {
    return makeSignal({ status: "NO DATA", reason: `No sessions logged in the last ${WINDOW_DAYS} days.` });
  }

  if (!comparable) {
    return makeSignal({ status: "NO DATA", reason: "Not enough history yet. It needs an older session to compare against.", recentSessions, recentRpe, rpeChange });
  }

  const pct = fmtPct(strengthChange);
  const isDown = strengthChange <= STRENGTH_DOWN_PCT;
  const rpeUsable = recentRpe !== null && rpeCoverage >= MIN_RPE_COVERAGE;
  const base = { recentSessions, recentRpe, rpeChange, confidence: (recentSessions < 2 ? "low" : "medium") as SignalConfidence };

  // Fallback if no RPE is logged
  if (!rpeUsable) {
    if (isDown) return makeSignal({ ...base, status: "MONITOR", reason: `Strength ${pct}. Log RPE so fatigue can be separated from lighter loads.` });
    return makeSignal({ ...base, status: "BUILD REPS", reason: `Strength ${pct}. Log RPE on your last set to get an exact load call.` });
  }

  base.confidence = "high";
  const rpe = recentRpe as number;

  // FATIGUE / STRENGTH DROP
  if (isDown) {
    const isHarder = rpe >= 9.0 || (rpeChange !== null && rpeChange >= RPE_HARDER_DELTA);
    if (isHarder) {
      return makeSignal({ ...base, status: "DIAL BACK", reason: `Strength ${pct} and fatigue is accumulating (RPE ${rpe.toFixed(1)}). Drop a working set or trim the load.` });
    }
    return makeSignal({ ...base, status: "MONITOR", reason: `Strength ${pct} but effort isn't spiking (RPE ${rpe.toFixed(1)}). Watch recovery before changing the plan.` });
  }

  // PROGRESSION / HOLDING / INCREASING
  if (rpe < 7.5) {
    return makeSignal({ ...base, status: "UP WEIGHT", reason: `Strength ${pct}. Effort is too low (RPE ${rpe.toFixed(1)}). Up the weight next session.` });
  }
  if (rpe >= 7.5 && rpe < 8.5) {
    return makeSignal({ ...base, status: "BUILD REPS", reason: `Strength ${pct}. Hitting the sweet spot. Keep the load and push for 1-2 more reps.` });
  }
  if (rpe >= 8.5 && rpe <= 9.0) {
    return makeSignal({ ...base, status: "SWEET SPOT", reason: `Strength ${pct}. Form is challenged. Hold it in the sweet spot until it feels easier.` });
  }
  // rpe > 9.0
  return makeSignal({ ...base, status: "CEILING", reason: `Strength ${pct} but effort is maxed (RPE ${rpe.toFixed(1)}). Drop a rep next session to manage fatigue.` });
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateTrainingProgress(sets: WorkoutSet[]): ProgressReport {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const now = endOfToday.getTime();
  const todayStr = endOfToday.toISOString().slice(0, 10);
  const windowStart = now - WINDOW_DAYS * MS_PER_DAY;

  // 1. Group valid sets by exercise and session (date), inside the rolling window.
  const history = new Map<string, ExerciseHistory>();
  const datesByMuscle = new Map<MuscleGroup, Set<string>>();

  for (const s of sets) {
    if (!s || !s.exerciseName || typeof s.date !== "string") continue;
    if (!(s.weight > 0) || !(s.reps > 0)) continue;

    const parts = s.date.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) continue;

    const time = new Date(s.date).getTime();
    if (Number.isNaN(time) || time > now || time < windowStart) continue;

    const muscle = getMuscleGroupForExercise(s.exerciseName);
    if (!muscle) continue;

    if (!datesByMuscle.has(muscle)) datesByMuscle.set(muscle, new Set<string>());
    datesByMuscle.get(muscle)!.add(s.date);

    if (!history.has(s.exerciseName)) {
      history.set(s.exerciseName, { exerciseName: s.exerciseName, muscle, sessions: new Map() });
    }
    const exercise = history.get(s.exerciseName)!;

    if (!exercise.sessions.has(s.date)) {
      exercise.sessions.set(s.date, { date: s.date, topE1rm: 0, volume: 0, rpe: null });
    }
    const entry = exercise.sessions.get(s.date)!;

    const e1rm = calculateE1RM(s.weight, s.reps);
    if (e1rm > entry.topE1rm) entry.topE1rm = e1rm;
    entry.volume += calculateSetVolume(s.weight, s.reps);

    const rpe = normaliseRpe(s.rpe);
    if (rpe !== null) entry.rpe = rpe;
  }

  if (history.size === 0) {
    return {
      overallStrengthChange: 0,
      muscleGroups: createEmptyMuscleGroups(),
      weeklyTrend: [],
    };
  }

  // 2. Each muscle's own "recent" sessions: its last N training dates.
  const allDatesByMuscle = new Map<MuscleGroup, string[]>();
  const recentDatesByMuscle = new Map<MuscleGroup, string[]>();
  datesByMuscle.forEach((dates, muscle) => {
    const sorted = Array.from(dates).sort().reverse();
    allDatesByMuscle.set(muscle, sorted);
    const recentCount =
      sorted.length > RECENT_SESSIONS_PER_MUSCLE ? RECENT_SESSIONS_PER_MUSCLE : Math.max(1, sorted.length - 1);
    recentDatesByMuscle.set(muscle, sorted.slice(0, recentCount));
  });

  // 3. Per exercise: recent vs baseline top-set e1RM (averaged), volume and RPE.
  const acuteVolumePerMuscle: Record<MuscleGroup, number> = { Chest: 0, Back: 0, Shoulders: 0, Biceps: 0, Triceps: 0, Legs: 0 };
  const chronicVolumePerMuscle: Record<MuscleGroup, number> = { Chest: 0, Back: 0, Shoulders: 0, Biceps: 0, Triceps: 0, Legs: 0 };

  const exerciseProgress: ExerciseProgress[] = [];

  history.forEach((exercise) => {
    const exDates = Array.from(exercise.sessions.keys()).sort().reverse();
    if (exDates.length === 0) return;

    // Freshness guard: if the exercise hasn't been performed in the last MAX_RECENT_SESSION_AGE_DAYS,
    // do not count it as active/recent training momentum (prevents ghost exercises from months ago popping up).
    const latestDate = exDates[0];
    const daysSinceLast = daysBetween(todayStr, latestDate);
    const isStale = daysSinceLast > MAX_RECENT_SESSION_AGE_DAYS;

    const recentCount = exDates.length > RECENT_SESSIONS_PER_MUSCLE
      ? RECENT_SESSIONS_PER_MUSCLE
      : Math.max(1, exDates.length - 1);
    
    // If stale, don't assign any recent execution dates for this specific exercise
    const recentExDates = new Set(isStale ? [] : exDates.slice(0, recentCount));

    const recentEntries: SessionEntry[] = [];
    const baselineEntries: SessionEntry[] = [];

    exercise.sessions.forEach((entry) => {
      (recentExDates.has(entry.date) ? recentEntries : baselineEntries).push(entry);
    });

    const acuteVolume = recentEntries.reduce((sum, e) => sum + e.volume, 0);
    const chronicVolume = baselineEntries.reduce((sum, e) => sum + e.volume, 0);
    
    // Only add to acute volume if not stale
    acuteVolumePerMuscle[exercise.muscle] += acuteVolume;
    chronicVolumePerMuscle[exercise.muscle] += chronicVolume;

    const recentRpes = recentEntries.filter((e) => e.rpe !== null).map((e) => e.rpe as number);
    const baseRpes = baselineEntries.filter((e) => e.rpe !== null).map((e) => e.rpe as number);

    exerciseProgress.push({
      exerciseName: exercise.exerciseName,
      muscle: exercise.muscle,
      legSubGroup: exercise.muscle === "Legs" ? getLegSubGroupForExercise(exercise.exerciseName) : null,
      baseE1rm: baselineEntries.length > 0 ? mean(baselineEntries.map((e) => e.topE1rm)) : 0,
      recentE1rm: recentEntries.length > 0 ? mean(recentEntries.map((e) => e.topE1rm)) : 0,
      acuteVolume,
      chronicVolume,
      recentRpe: recentRpes.length > 0 ? mean(recentRpes) : null,
      baseRpe: baseRpes.length > 0 ? mean(baseRpes) : null,
      recentEntries,
    });
  });

  // 4. Muscle-level strength change (weighted by recent volume), RPE and signal.
  type MuscleAccumulator = {
    totalWeightedChange: number;
    totalWeight: number;
    exercises: TopExercise[];
  };
  const muscleStrengthChanges = {} as Record<MuscleGroup, MuscleAccumulator>;
  MUSCLE_GROUPS.forEach((group) => {
    muscleStrengthChanges[group] = { totalWeightedChange: 0, totalWeight: 0, exercises: [] };
  });

  exerciseProgress.forEach((data) => {
    if (data.acuteVolume <= 0) return;

    const exercise = createTopExercise(data);
    muscleStrengthChanges[data.muscle].exercises.push(exercise);

    if (data.baseE1rm > 0 && data.recentE1rm > 0) {
      const strengthChange = ((data.recentE1rm - data.baseE1rm) / data.baseE1rm) * 100;
      muscleStrengthChanges[data.muscle].totalWeightedChange += strengthChange * data.acuteVolume;
      muscleStrengthChanges[data.muscle].totalWeight += data.acuteVolume;
    }
  });

  const muscleGroupSummaries = {} as Record<MuscleGroup, MuscleGroupSummary>;
  let overallWeightedStrengthChange = 0;
  let overallStrengthWeight = 0;

  MUSCLE_GROUPS.forEach((group) => {
    const mData = muscleStrengthChanges[group];
    const strengthChange = mData.totalWeight > 0 ? round1(mData.totalWeightedChange / mData.totalWeight) : 0;
    const currentVolume = acuteVolumePerMuscle[group];
    const baselineVolume = chronicVolumePerMuscle[group] / 4;

    const topExercises = [...mData.exercises]
      .filter((exercise) => exercise.trendVolume > 0)
      .sort((a, b) => b.trendVolume - a.trendVolume)
      .slice(0, 3);

    // RPE and per-session strength for this muscle's recent sessions.
    const muscleExercises = exerciseProgress.filter((e) => e.muscle === group);
    const recentExercises = muscleExercises.filter((e) => e.acuteVolume > 0);

    let rpeWeightSum = 0;
    let rpeWeighted = 0;
    let deltaWeightSum = 0;
    let deltaWeighted = 0;
    let withRpe = 0;

    recentExercises.forEach((e) => {
      if (e.recentRpe === null) return;
      withRpe += 1;
      rpeWeightSum += e.acuteVolume;
      rpeWeighted += e.recentRpe * e.acuteVolume;
      if (e.baseRpe !== null) {
        deltaWeightSum += e.acuteVolume;
        deltaWeighted += (e.recentRpe - e.baseRpe) * e.acuteVolume;
      }
    });

    const recentRpe = rpeWeightSum > 0 ? round1(rpeWeighted / rpeWeightSum) : null;
    const rpeChange = deltaWeightSum > 0 ? round1(deltaWeighted / deltaWeightSum) : null;
    const rpeCoverage = recentExercises.length > 0 ? withRpe / recentExercises.length : 0;

    const recentDates = recentDatesByMuscle.get(group) ?? [];
    const sessionChanges: Array<number | null> = recentDates.map((date) => {
      let weighted = 0;
      let weight = 0;
      muscleExercises.forEach((e) => {
        if (e.baseE1rm <= 0) return;
        const entry = e.recentEntries.find((r) => r.date === date);
        if (!entry) return;
        weighted += ((entry.topE1rm - e.baseE1rm) / e.baseE1rm) * 100 * entry.volume;
        weight += entry.volume;
      });
      return weight > 0 ? weighted / weight : null;
    });

    const signal = buildSignal({
      strengthChange,
      comparable: mData.totalWeight > 0,
      recentDates,
      allDates: allDatesByMuscle.get(group) ?? [],
      recentRpe,
      rpeChange,
      rpeCoverage,
      sessionChanges,
    });

    const legSubGroups = createEmptyLegSubGroups();

    if (group === "Legs") {
      LEG_MUSCLE_GROUPS.forEach((subGroup) => {
        const subgroupExercises = exerciseProgress.filter(
          (exercise) => exercise.muscle === "Legs" && exercise.legSubGroup === subGroup
        );

        if (subgroupExercises.length === 0) return;

        const subgroupCurrentVolume = subgroupExercises.reduce((sum, exercise) => sum + exercise.acuteVolume, 0);
        const subgroupPreviousVolume = subgroupExercises.reduce((sum, exercise) => sum + exercise.chronicVolume, 0);
        const subgroupBaselineVolume = subgroupPreviousVolume / 4;

        let subgroupWeightedStrength = 0;
        let subgroupStrengthWeight = 0;

        subgroupExercises.forEach((exercise) => {
          if (exercise.acuteVolume <= 0) return;
          if (exercise.baseE1rm > 0 && exercise.recentE1rm > 0) {
            const exerciseStrengthChange = ((exercise.recentE1rm - exercise.baseE1rm) / exercise.baseE1rm) * 100;
            subgroupWeightedStrength += exerciseStrengthChange * exercise.acuteVolume;
            subgroupStrengthWeight += exercise.acuteVolume;
          }
        });

        const subgroupStrengthChange =
          subgroupStrengthWeight > 0 ? round1(subgroupWeightedStrength / subgroupStrengthWeight) : 0;

        const subgroupTopExercises = subgroupExercises
          .filter((exercise) => exercise.acuteVolume > 0)
          .map((exercise) => createTopExercise(exercise))
          .sort((a, b) => b.trendVolume - a.trendVolume)
          .slice(0, 3);

        legSubGroups[subGroup] = {
          strengthChange: subgroupStrengthChange,
          currentVolume: round1(subgroupCurrentVolume),
          baselineVolume: round1(subgroupBaselineVolume),
          topExercises: subgroupTopExercises,
        };
      });
    }

    muscleGroupSummaries[group] = {
      strengthChange,
      currentVolume: round1(currentVolume),
      baselineVolume: round1(baselineVolume),
      topExercises,
      legSubGroups,
      signal,
    };

    if (mData.totalWeight > 0) {
      overallWeightedStrengthChange += mData.totalWeightedChange;
      overallStrengthWeight += mData.totalWeight;
    }
  });

  const overallStrengthChange =
    overallStrengthWeight > 0 ? round1(overallWeightedStrengthChange / overallStrengthWeight) : 0;

  return {
    overallStrengthChange,
    muscleGroups: muscleGroupSummaries,
    weeklyTrend: [],
  };
}
