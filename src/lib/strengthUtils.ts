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
 */

export type WorkoutSet = {
  exerciseName: string;
  weight: number;
  reps: number;
  date: string; // YYYY-MM-DD
};

export type TopExercise = {
  exerciseName: string;
  currentE1RM: number;
  baselineE1RM: number;
  percentChange: number;
  volumeChange: number;
  currentVolume: number;
  trendVolume: number;
  isNew: boolean;
  isDropped: boolean;
};

export type LegSubGroupSummary = {
  strengthChange: number;
  volumeChange: number;
  currentSets: number;
  baselineSets: number;
  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;
  volumeChange: number;
  currentSets: number;
  baselineSets: number;
  topExercises: TopExercise[];
  legSubGroups: Record<LegSubGroup, LegSubGroupSummary>;
};

export type ProgressReport = {
  overallStrengthChange: number;
  overallVolumeChange: number;
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
  currentVolume: number;
  baselineVolume: number;
  currentSets: number;
  baselineSets: number;
};

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

function calculateSetVolume(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) {
    return 0;
  }

  return weight * reps;
}

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
    strengthChange = 100;
  } else if (data.baseE1rm > 0 && data.recentE1rm === 0) {
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

  const currentWindowStart = now - 28 * MS_PER_DAY;
  const baselineWindowStart = now - 56 * MS_PER_DAY;
  const baselineWindowEnd = currentWindowStart;

  const parseDate = (dateStr: string): number => {
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-").map(Number);
      if (parts.length === 3 && !parts.some((part) => Number.isNaN(part))) {
        return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0).getTime();
      }
    }
    
    const parsedTime = new Date(dateStr).getTime();
    return Number.isNaN(parsedTime) ? NaN : parsedTime;
  };

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

  const exerciseMap = new Map<string, ExerciseProgress>();

  validSets.forEach((set) => {
    const muscle = getMuscleGroupForExercise(set.exerciseName);

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

  const muscleGroupSummaries = {} as Record<MuscleGroup, MuscleGroupSummary>;

  let overallWeightedStrengthChange = 0;
  let overallStrengthWeight = 0;

  MUSCLE_GROUPS.forEach((group) => {
    const groupExercises = exerciseProgress.filter(
      (exercise) => exercise.muscle === group
    );

    const strength = weightedStrength(groupExercises);

    const strengthChange =
      strength.weight > 0
        ? Math.round((strength.weightedChange / strength.weight) * 10) / 10
        : 0;

    const currentSets = groupExercises.reduce(
      (sum, e) => sum + e.currentSets,
      0
    );

    const baselineSets = groupExercises.reduce(
      (sum, e) => sum + e.baselineSets,
      0
    );

    const volumeChange = calculatePercentChange(currentSets, baselineSets);

    const topExercises = groupExercises
      .map((exercise) => createTopExercise(exercise))
      .filter((exercise) => exercise.trendVolume > 0)
      .sort((a, b) => b.trendVolume - a.trendVolume)
      .slice(0, 3);

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
