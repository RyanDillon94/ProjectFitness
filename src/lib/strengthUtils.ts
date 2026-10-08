import {
  getMuscleGroupForExercise,
  getLegSubGroupForExercise,
  MuscleGroup,
  LegSubGroup,
  MUSCLE_GROUPS,
  LEG_MUSCLE_GROUPS,
} from "./strengthMapping";

/*
 * ============================================================
 * TRAINING MOMENTUM — ROLLING 4 WEEKS vs PREVIOUS 4 WEEKS
 * ============================================================
 *
 * CURRENT window:  the last 28 days (including today)
 * BASELINE window: the 28 days before that
 * Total history used: 56 days
 *
 * Units:
 * - Headline + muscle group + leg subgroup volume → SET COUNT
 *   (every muscle is weighted equally, so heavy leg lifts can't
 *   swamp the total)
 * - Exercise-level volume → weight × reps (captures load/rep changes)
 * - Strength → best estimated 1RM per exercise, current vs baseline
 */

export type WorkoutSet = {
  exerciseName: string;
  weight: number;
  reps: number;
  date: string; // YYYY-MM-DD
};

export type TopExercise = {
  exerciseName: string;

  // Best e1RM achieved in the current 4-week window.
  currentE1RM: number;

  // Best e1RM achieved in the previous 4-week window.
  baselineE1RM: number;

  // Current best e1RM vs baseline best e1RM (%).
  percentChange: number;

  // Current 4-week tonnage (weight × reps) vs previous 4-week tonnage (%).
  volumeChange: number;

  // Actual current 4-week tonnage.
  currentVolume: number;

  // Total tonnage across both windows. Used only to rank top exercises.
  trendVolume: number;

  // Performed in the current window, but not in the previous one.
  isNew: boolean;

  // Performed in the previous window, but not in the current one.
  // The UI shows "—" instead of -100%.
  isDropped: boolean;
};

export type LegSubGroupSummary = {
  strengthChange: number;

  // Change in SET COUNT, current 4 weeks vs previous 4 weeks (%).
  volumeChange: number;

  // Working sets in the current 4 weeks.
  currentSets: number;

  // Working sets in the previous 4 weeks.
  baselineSets: number;

  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;

  // Change in SET COUNT, current 4 weeks vs previous 4 weeks (%).
  volumeChange: number;

  // Working sets in the current 4 weeks.
  currentSets: number;

  // Working sets in the previous 4 weeks.
  baselineSets: number;

  topExercises: TopExercise[];

  legSubGroups: Record<LegSubGroup, LegSubGroupSummary>;
};

export type ProgressReport = {
  overallStrengthChange: number;

  // Headline volume change, based on SET COUNT.
  overallVolumeChange: number;

  // Total working sets in each window (for "has baseline?" checks).
  overallCurrentSets: number;
  overallBaselineSets: number;

  muscleGroups: Record<MuscleGroup, MuscleGroupSummary>;
  weeklyTrend: any[];
};

type ExerciseProgress = {
  exerciseName: string;
  muscle: MuscleGroup;
  legSubGroup: LegSubGroup | null;

  baseE1rm: number;
  recentE1rm: number;

  // Tonnage (weight × reps)
  currentVolume: number;
  baselineVolume: number;

  // Working set counts
  currentSets: number;
  baselineSets: number;
};

/*
 * Exercise names that couldn't be mapped to a muscle group.
 * Warned once per name so the console isn't spammed.
 */
const warnedUnmappedExercises = new Set<string>();

export function calculateE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) {
    return 0;
  }

  if (reps === 1) {
    return weight;
  }

  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Tonnage for a single set: weight × reps.
 */
function calculateSetVolume(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) {
    return 0;
  }

  return weight * reps;
}

/**
 * Percentage change between two totals.
 * Works for set counts or tonnage.
 *
 * baseline = 0 and current > 0 → 100 (UI shows NEW via flags)
 */
function calculatePercentChange(current: number, baseline: number): number {
  if (baseline === 0 && current === 0) {
    return 0;
  }

  if (baseline === 0 && current > 0) {
    return 100;
  }

  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

function createEmptyLegSubGroups(): Record<LegSubGroup, LegSubGroupSummary> {
  const result = {} as Record<LegSubGroup, LegSubGroupSummary>;

  LEG_MUSCLE_GROUPS.forEach((group) => {
    result[group] = {
      strengthChange: 0,
      volumeChange: 0,
      currentSets: 0,
      baselineSets: 0,
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
      volumeChange: 0,
      currentSets: 0,
      baselineSets: 0,
      topExercises: [],
      legSubGroups: createEmptyLegSubGroups(),
    };
  });

  return result;
}

/**
 * Creates the display-ready exercise object.
 *
 * NEW:     active in the current window, nothing in the baseline.
 * DROPPED: active in the baseline, nothing in the current window.
 *
 * Underlying numbers stay available. The UI decides how to show
 * NEW / DROPPED instead of +100% / -100%.
 */
function createTopExercise(data: ExerciseProgress): TopExercise {
  const hasCurrentActivity = data.currentVolume > 0;
  const hasBaselineActivity = data.baselineVolume > 0;

  const isNew = hasCurrentActivity && !hasBaselineActivity;
  const isDropped = hasBaselineActivity && !hasCurrentActivity;

  let strengthChange = 0;

  if (data.baseE1rm > 0 && data.recentE1rm > 0) {
    strengthChange =
      ((data.recentE1rm - data.baseE1rm) / data.baseE1rm) * 100;
  } else if (data.baseE1rm === 0 && data.recentE1rm > 0) {
    // No previous baseline. UI uses isNew to display NEW.
    strengthChange = 100;
  } else if (data.baseE1rm > 0 && data.recentE1rm === 0) {
    // Not performed in the current window. UI uses isDropped to display "—".
    strengthChange = -100;
  }

  const volumeChange = calculatePercentChange(
    data.currentVolume,
    data.baselineVolume
  );

  const trendVolume = data.currentVolume + data.baselineVolume;

  return {
    exerciseName: data.exerciseName,
    currentE1RM: data.recentE1rm,
    baselineE1RM: data.baseE1rm > 0 ? data.baseE1rm : data.recentE1rm,
    percentChange: Math.round(strengthChange * 10) / 10,
    volumeChange,
    currentVolume: Math.round(data.currentVolume * 10) / 10,
    trendVolume: Math.round(trendVolume * 10) / 10,
    isNew,
    isDropped,
  };
}

/**
 * Volume-weighted average strength change for a list of exercises.
 *
 * Only exercises with BOTH a baseline e1RM and a current e1RM count.
 * New and dropped exercises are excluded so they can't distort the average.
 * Weighted by current tonnage.
 */
function weightedStrength(exercises: ExerciseProgress[]): {
  weightedChange: number;
  weight: number;
} {
  let weightedChange = 0;
  let weight = 0;

  exercises.forEach((exercise) => {
    if (
      exercise.currentVolume > 0 &&
      exercise.baseE1rm > 0 &&
      exercise.recentE1rm > 0
    ) {
      const change =
        ((exercise.recentE1rm - exercise.baseE1rm) / exercise.baseE1rm) * 100;

      weightedChange += change * exercise.currentVolume;
      weight += exercise.currentVolume;
    }
  });

  return { weightedChange, weight };
}

export function calculateTrainingProgress(sets: WorkoutSet[]): ProgressReport {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const now = endOfToday.getTime();
  const MS_PER_DAY = 86_400_000;

  // CURRENT: last 28 days
  const currentWindowStart = now - 28 * MS_PER_DAY;

  // BASELINE: the 28 days before the current window
  const baselineWindowStart = now - 56 * MS_PER_DAY;
  const baselineWindowEnd = currentWindowStart;

  // Replace your old parseDate function inside calculateTrainingProgress with this robust version
const parseDate = (dateString: string): number => {
  if (!dateString) return NaN;

  // 1. Try passing it to the native Date parser (works safely for YYYY-MM-DD or standard ISO)
  const d = new Date(dateString);
  if (!isNaN(d.getTime())) {
    // Snap it to noon to avoid any timezone boundary/midnight slip bugs
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
  }

  // 2. Hard fallback if native parsing fails for some reason
  const parts = dateString.split("-").map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0).getTime();
  }
  
  return NaN;
};


  // Only valid sets inside the full 56-day window are considered.
  const validSets = sets.filter((s) => {
    if (!s || !s.exerciseName || s.weight <= 0 || s.reps <= 0) {
      return false;
    }

    const time = parseDate(s.date);

    return !Number.isNaN(time) && time >= baselineWindowStart && time <= now;
  });

  if (validSets.length === 0) {
    return {
      overallStrengthChange: 0,
      overallVolumeChange: 0,
      overallCurrentSets: 0,
      overallBaselineSets: 0,
      muscleGroups: createEmptyMuscleGroups(),
      weeklyTrend: [],
    };
  }

  /*
   * EXERCISE DATA
   *
   * Only the PRIMARY muscle from getMuscleGroupForExercise is used.
   * Secondary muscles do NOT receive volume or strength.
   */
  const exerciseMap = new Map<string, ExerciseProgress>();

  validSets.forEach((set) => {
    const muscle = getMuscleGroupForExercise(set.exerciseName);

    /*
     * Unknown exercises are ignored rather than assigned to an
     * arbitrary muscle. Warn once per name so mapping gaps are visible.
     */
    if (!muscle) {
      if (!warnedUnmappedExercises.has(set.exerciseName)) {
        warnedUnmappedExercises.add(set.exerciseName);
        console.warn(
          `[Training Momentum] Unmapped exercise ignored: "${set.exerciseName}"`
        );
      }
      return;
    }

    const time = parseDate(set.date);

    const isCurrent = time >= currentWindowStart;
    const isBaseline = time >= baselineWindowStart && time < baselineWindowEnd;

    const e1rm = calculateE1RM(set.weight, set.reps);
    const setVolume = calculateSetVolume(set.weight, set.reps);

    let entry = exerciseMap.get(set.exerciseName);

    if (!entry) {
      entry = {
        exerciseName: set.exerciseName,
        muscle,
        legSubGroup:
          muscle === "Legs"
            ? getLegSubGroupForExercise(set.exerciseName)
            : null,
        baseE1rm: 0,
        recentE1rm: 0,
        currentVolume: 0,
        baselineVolume: 0,
        currentSets: 0,
        baselineSets: 0,
      };

      exerciseMap.set(set.exerciseName, entry);
    }

    if (isCurrent) {
      entry.currentSets += 1;
      entry.currentVolume += setVolume;

      if (e1rm > entry.recentE1rm) {
        entry.recentE1rm = e1rm;
      }
    }

    if (isBaseline) {
      entry.baselineSets += 1;
      entry.baselineVolume += setVolume;

      if (e1rm > entry.baseE1rm) {
        entry.baseE1rm = e1rm;
      }
    }
  });

  const exerciseProgress = Array.from(exerciseMap.values());

  /*
   * OVERALL VOLUME (HEADLINE) — SET COUNT
   */
  const overallCurrentSets = exerciseProgress.reduce(
    (sum, e) => sum + e.currentSets,
    0
  );

  const overallBaselineSets = exerciseProgress.reduce(
    (sum, e) => sum + e.baselineSets,
    0
  );

  const overallVolumeChange = calculatePercentChange(
    overallCurrentSets,
    overallBaselineSets
  );

  /*
   * MUSCLE GROUP SUMMARIES
   */
  const muscleGroupSummaries = {} as Record<MuscleGroup, MuscleGroupSummary>;

  let overallWeightedStrengthChange = 0;
  let overallStrengthWeight = 0;

  MUSCLE_GROUPS.forEach((group) => {
    const groupExercises = exerciseProgress.filter(
      (exercise) => exercise.muscle === group
    );

    // Strength
    const strength = weightedStrength(groupExercises);

    const strengthChange =
      strength.weight > 0
        ? Math.round((strength.weightedChange / strength.weight) * 10) / 10
        : 0;

    // Volume (sets)
    const currentSets = groupExercises.reduce(
      (sum, e) => sum + e.currentSets,
      0
    );

    const baselineSets = groupExercises.reduce(
      (sum, e) => sum + e.baselineSets,
      0
    );

    const volumeChange = calculatePercentChange(currentSets, baselineSets);

    /*
     * TOP 3 EXERCISES — ranked by total tonnage across both windows.
     * No "performed twice" rule. Dropped and new exercises both qualify.
     */
    const topExercises = groupExercises
      .map((exercise) => createTopExercise(exercise))
      .filter((exercise) => exercise.trendVolume > 0)
      .sort((a, b) => b.trendVolume - a.trendVolume)
      .slice(0, 3);

    /*
     * LEG SUBGROUPS
     */
    const legSubGroups = createEmptyLegSubGroups();

    if (group === "Legs") {
      LEG_MUSCLE_GROUPS.forEach((subGroup) => {
        const subgroupExercises = groupExercises.filter(
          (exercise) => exercise.legSubGroup === subGroup
        );

        if (subgroupExercises.length === 0) {
          return;
        }

        const subCurrentSets = subgroupExercises.reduce(
          (sum, e) => sum + e.currentSets,
          0
        );

        const subBaselineSets = subgroupExercises.reduce(
          (sum, e) => sum + e.baselineSets,
          0
        );

        const subStrength = weightedStrength(subgroupExercises);

        const subgroupTopExercises = subgroupExercises
          .map((exercise) => createTopExercise(exercise))
          .filter((exercise) => exercise.trendVolume > 0)
          .sort((a, b) => b.trendVolume - a.trendVolume)
          .slice(0, 3);

        legSubGroups[subGroup] = {
          strengthChange:
            subStrength.weight > 0
              ? Math.round(
                  (subStrength.weightedChange / subStrength.weight) * 10
                ) / 10
              : 0,
          volumeChange: calculatePercentChange(
            subCurrentSets,
            subBaselineSets
          ),
          currentSets: subCurrentSets,
          baselineSets: subBaselineSets,
          topExercises: subgroupTopExercises,
        };
      });
    }

    muscleGroupSummaries[group] = {
      strengthChange,
      volumeChange,
      currentSets,
      baselineSets,
      topExercises,
      legSubGroups,
    };

    // Overall strength excludes Biceps and Triceps (existing behaviour).
    if (strength.weight > 0 && group !== "Biceps" && group !== "Triceps") {
      overallWeightedStrengthChange += strength.weightedChange;
      overallStrengthWeight += strength.weight;
    }
  });

  const overallStrengthChange =
    overallStrengthWeight > 0
      ? Math.round(
          (overallWeightedStrengthChange / overallStrengthWeight) * 10
        ) / 10
      : 0;

  return {
    overallStrengthChange,
    overallVolumeChange,
    overallCurrentSets,
    overallBaselineSets,
    muscleGroups: muscleGroupSummaries,
    weeklyTrend: [],
  };
}
