import { getMuscleGroupForExercise, MuscleGroup, MUSCLE_GROUPS } from "./strengthMapping";

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
  currentSets: number;
};

export type MuscleGroupSummary = {
  strengthChange: number;
  volumeChange: number;
  currentVolume: number; // Represents total effective sets
  baselineVolume: number; // Represents baseline effective sets
  topExercises: TopExercise[];
};

export type ProgressReport = {
  overallStrengthChange: number;
  overallVolumeChange: number;
  muscleGroups: Record<MuscleGroup, MuscleGroupSummary>;
  weeklyTrend: any[];
};

export function calculateE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Determines if an exercise provides secondary synergist contribution
function getMuscleCredits(exerciseName: string, primaryMuscle: MuscleGroup): { muscle: MuscleGroup; credit: number }[] {
  const credits: { muscle: MuscleGroup; credit: number }[] = [
    { muscle: primaryMuscle, credit: 1.0 },
  ];

  const lower = exerciseName.toLowerCase();

  // Secondary compound pulling -> 0.5 sets to Biceps
  if (primaryMuscle === "Back" && !lower.includes("straight arm") && !lower.includes("shrug")) {
    credits.push({ muscle: "Biceps", credit: 0.5 });
  }

  // Secondary compound pressing -> 0.5 sets to Triceps
  if ((primaryMuscle === "Chest" || primaryMuscle === "Shoulders") && (lower.includes("press") || lower.includes("dip"))) {
    credits.push({ muscle: "Triceps", credit: 0.5 });
  }

  return credits;
}

export function calculateTrainingProgress(sets: WorkoutSet[]): ProgressReport {
  const now = new Date().getTime();
  const MS_PER_DAY = 86_400_000;

  // Continuous 28-day rolling windows
  const currentWindowStart = now - (28 * MS_PER_DAY); // Days 0-28 (Current)
  const baselineWindowStart = now - (56 * MS_PER_DAY); // Days 29-56 (Baseline)

  const validSets = sets.filter((s) => {
    if (!s || s.weight <= 0 || s.reps <= 0) return false;
    const time = new Date(s.date).getTime();
    return !isNaN(time) && time >= baselineWindowStart && time <= now;
  });

  if (validSets.length === 0) {
    const emptyGroups = {} as Record<MuscleGroup, MuscleGroupSummary>;
    MUSCLE_GROUPS.forEach((g) => {
      emptyGroups[g] = { strengthChange: 0, volumeChange: 0, currentVolume: 0, baselineVolume: 0, topExercises: [] };
    });
    return { overallStrengthChange: 0, overallVolumeChange: 0, muscleGroups: emptyGroups, weeklyTrend: [] };
  }

  const exerciseComparison: Map<string, {
    primaryMuscle: MuscleGroup;
    baseE1rm: number;
    recentE1rm: number;
    baseSets: number;
    recentSets: number;
    recentDates: Set<string>;
  }> = new Map();

  const muscleSetsCurrent: Record<MuscleGroup, number> = { Chest: 0, Back: 0, Shoulders: 0, Biceps: 0, Triceps: 0, Legs: 0 };
  const muscleSetsBase: Record<MuscleGroup, number> = { Chest: 0, Back: 0, Shoulders: 0, Biceps: 0, Triceps: 0, Legs: 0 };
  let totalSetsBase = 0;
  let totalSetsCurrent = 0;

  validSets.forEach((s) => {
    const primaryMuscle = getMuscleGroupForExercise(s.exerciseName);
    if (!primaryMuscle) return;

    const time = new Date(s.date).getTime();
    const e1rm = calculateE1RM(s.weight, s.reps);
    const isRecent = time >= currentWindowStart;

    if (!exerciseComparison.has(s.exerciseName)) {
      exerciseComparison.set(s.exerciseName, {
        primaryMuscle,
        baseE1rm: 0,
        recentE1rm: 0,
        baseSets: 0,
        recentSets: 0,
        recentDates: new Set(),
      });
    }

    const entry = exerciseComparison.get(s.exerciseName)!;

    if (isRecent) {
      entry.recentSets += 1;
      entry.recentDates.add(s.date);
      if (e1rm > entry.recentE1rm) entry.recentE1rm = e1rm;
    } else {
      entry.baseSets += 1;
      if (e1rm > entry.baseE1rm) entry.baseE1rm = e1rm;
    }

    // Allocate hard set credits (1.0 direct, 0.5 indirect)
    const credits = getMuscleCredits(s.exerciseName, primaryMuscle);
    credits.forEach(({ muscle, credit }) => {
      if (isRecent) {
        muscleSetsCurrent[muscle] += credit;
        totalSetsCurrent += credit;
      } else {
        muscleSetsBase[muscle] += credit;
        totalSetsBase += credit;
      }
    });
  });

  const muscleStrengthChanges: Record<MuscleGroup, { totalWeightedChange: number; totalWeight: number; exercises: TopExercise[] }> = {
    Chest: { totalWeightedChange: 0, totalWeight: 0, exercises: [] },
    Back: { totalWeightedChange: 0, totalWeight: 0, exercises: [] },
    Shoulders: { totalWeightedChange: 0, totalWeight: 0, exercises: [] },
    Biceps: { totalWeightedChange: 0, totalWeight: 0, exercises: [] },
    Triceps: { totalWeightedChange: 0, totalWeight: 0, exercises: [] },
    Legs: { totalWeightedChange: 0, totalWeight: 0, exercises: [] },
  };

  exerciseComparison.forEach((data, exerciseName) => {
    let exChange = 0;
    if (data.baseE1rm > 0 && data.recentE1rm > 0) {
      exChange = ((data.recentE1rm - data.baseE1rm) / data.baseE1rm) * 100;
      const weight = data.recentSets + data.baseSets;

      muscleStrengthChanges[data.primaryMuscle].totalWeightedChange += exChange * weight;
      muscleStrengthChanges[data.primaryMuscle].totalWeight += weight;
    } else if (data.baseE1rm === 0 && data.recentE1rm > 0) {
      exChange = 100;
    }

    // Only surface exercises performed on at least 2 distinct days
    if (data.recentSets > 0 && data.recentDates.size >= 2) {
      muscleStrengthChanges[data.primaryMuscle].exercises.push({
        exerciseName,
        currentE1RM: data.recentE1rm,
        baselineE1RM: data.baseE1rm,
        percentChange: Math.round(exChange * 10) / 10,
        currentSets: data.recentSets,
      });
    }
  });

  // Calculate volume percentage delta
  const calcChange = (current: number, base: number) => {
    if (base === 0 && current === 0) return 0;
    if (base === 0 && current > 0) return 100;
    return Math.round(((current - base) / base) * 1000) / 10;
  };

  const overallVolumeChange = calcChange(totalSetsCurrent, totalSetsBase);

  const muscleGroupSummaries = {} as Record<MuscleGroup, MuscleGroupSummary>;
  let overallWeightedStrengthChange = 0;
  let overallStrengthWeight = 0;

  MUSCLE_GROUPS.forEach((group) => {
    const mData = muscleStrengthChanges[group];
    const strengthChange = mData.totalWeight > 0
      ? Math.round((mData.totalWeightedChange / mData.totalWeight) * 10) / 10
      : 0;

    const vBase = muscleSetsBase[group];
    const vCurrent = muscleSetsCurrent[group];
    const volumeChange = calcChange(vCurrent, vBase);

    // Rank top exercises by total direct sets completed
    const topExercises = mData.exercises
      .sort((a, b) => b.currentSets - a.currentSets)
      .slice(0, 3);

    muscleGroupSummaries[group] = {
      strengthChange,
      volumeChange,
      currentVolume: Math.round(vCurrent * 10) / 10,
      baselineVolume: Math.round(vBase * 10) / 10,
      topExercises,
    };

    if (mData.totalWeight > 0 && group !== "Biceps" && group !== "Triceps") {
      overallWeightedStrengthChange += mData.totalWeightedChange;
      overallStrengthWeight += mData.totalWeight;
    }
  });

  const overallStrengthChange = overallStrengthWeight > 0
    ? Math.round((overallWeightedStrengthChange / overallStrengthWeight) * 10) / 10
    : 0;

  return {
    overallStrengthChange,
    overallVolumeChange,
    muscleGroups: muscleGroupSummaries,
    weeklyTrend: [],
  };
}
