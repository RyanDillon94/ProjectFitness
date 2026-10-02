import {
  getMuscleGroupForExercise,
  getExerciseTargets,
  MuscleGroup,
  MUSCLE_GROUPS,
  LegMuscleGroup,
  LEG_MUSCLE_GROUPS,
} from "./strengthMapping";

export type WorkoutSet = {
  exerciseName: string;
  weight: number;
  reps: number;
  date: string;
};

export type TopExercise = {
  exerciseName: string;
  currentE1RM: number;
  baselineE1RM: number;
  percentChange: number;
  currentSets: number;
};

export type LegMuscleSummary = {
  muscle: LegMuscleGroup;
  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;
  volumeChange: number;
  currentVolume: number;
  baselineVolume: number;
  topExercises: TopExercise[];
  legMuscles?: Record<LegMuscleGroup, LegMuscleSummary>;
};

export type ProgressReport = {
  overallStrengthChange: number;
  overallVolumeChange: number;
  muscleGroups: Record<MuscleGroup, MuscleGroupSummary>;
  weeklyTrend: any[];
};

export function calculateE1RM(
  weight: number,
  reps: number
): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;

  return Math.round(
    weight * (1 + reps / 30) * 10
  ) / 10;
}

export function calculateTrainingProgress(
  sets: WorkoutSet[]
): ProgressReport {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const now = endOfToday.getTime();

  const MS_PER_DAY = 86_400_000;

  // Acute window: last 7 days
  const acuteWindowStart =
    now - 7 * MS_PER_DAY;

  // Chronic baseline: trailing 28 days
  const chronicWindowStart =
    now - 28 * MS_PER_DAY;

  const validSets = sets.filter((s) => {
    if (!s || s.weight <= 0 || s.reps <= 0) {
      return false;
    }

    const parts = s.date.split("-").map(Number);

    const time = new Date(
      parts[0],
      parts[1] - 1,
      parts[2],
      12,
      0,
      0
    ).getTime();

    return (
      !isNaN(time) &&
      time >= chronicWindowStart &&
      time <= now
    );
  });

  if (validSets.length === 0) {
    const emptyGroups =
      {} as Record<
        MuscleGroup,
        MuscleGroupSummary
      >;

    MUSCLE_GROUPS.forEach((group) => {
      const emptyLegMuscles =
        {} as Record<
          LegMuscleGroup,
          LegMuscleSummary
        >;

      if (group === "Legs") {
        LEG_MUSCLE_GROUPS.forEach(
          (legMuscle) => {
            emptyLegMuscles[legMuscle] = {
              muscle: legMuscle,
              topExercises: [],
            };
          }
        );
      }

      emptyGroups[group] = {
        strengthChange: 0,
        volumeChange: 0,
        currentVolume: 0,
        baselineVolume: 0,
        topExercises: [],
        ...(group === "Legs"
          ? { legMuscles: emptyLegMuscles }
          : {}),
      };
    });

    return {
      overallStrengthChange: 0,
      overallVolumeChange: 0,
      muscleGroups: emptyGroups,
      weeklyTrend: [],
    };
  }

  // ============================================================
  // Exercise comparison
  // ============================================================

  const exerciseComparison: Map<
    string,
    {
      muscle: MuscleGroup;
      legMuscle: LegMuscleGroup | null;
      baseE1rm: number;
      recentE1rm: number;
      acuteSets: number;
      chronicSets: number;
      recentDates: Set<string>;
    }
  > = new Map();

  const acuteSetsPerMuscle: Record<
    MuscleGroup,
    number
  > = {
    Chest: 0,
    Back: 0,
    Shoulders: 0,
    Biceps: 0,
    Triceps: 0,
    Legs: 0,
  };

  const chronicSetsPerMuscle: Record<
    MuscleGroup,
    number
  > = {
    Chest: 0,
    Back: 0,
    Shoulders: 0,
    Biceps: 0,
    Triceps: 0,
    Legs: 0,
  };

  validSets.forEach((s) => {
    const target = getExerciseTargets(
      s.exerciseName
    );

    if (!target) return;

    const muscle = target.primary;

    const parts = s.date
      .split("-")
      .map(Number);

    const time = new Date(
      parts[0],
      parts[1] - 1,
      parts[2],
      12,
      0,
      0
    ).getTime();

    const e1rm = calculateE1RM(
      s.weight,
      s.reps
    );

    const isAcute =
      time >= acuteWindowStart;

    if (
      !exerciseComparison.has(
        s.exerciseName
      )
    ) {
      exerciseComparison.set(
        s.exerciseName,
        {
          muscle,
          legMuscle:
            target.primary === "Legs"
              ? target.legMuscle ?? null
              : null,
          baseE1rm: 0,
          recentE1rm: 0,
          acuteSets: 0,
          chronicSets: 0,
          recentDates: new Set(),
        }
      );
    }

    const entry =
      exerciseComparison.get(
        s.exerciseName
      )!;

    entry.chronicSets += 1;

    chronicSetsPerMuscle[muscle] += 1;

    if (isAcute) {
      entry.acuteSets += 1;

      entry.recentDates.add(s.date);

      acuteSetsPerMuscle[muscle] += 1;

      if (
        e1rm > entry.recentE1rm
      ) {
        entry.recentE1rm = e1rm;
      }
    } else {
      if (
        e1rm > entry.baseE1rm
      ) {
        entry.baseE1rm = e1rm;
      }
    }
  });

  // ============================================================
  // Strength calculations
  // ============================================================

  const muscleStrengthChanges: Record<
    MuscleGroup,
    {
      totalWeightedChange: number;
      totalWeight: number;
      exercises: TopExercise[];
    }
  > = {
    Chest: {
      totalWeightedChange: 0,
      totalWeight: 0,
      exercises: [],
    },
    Back: {
      totalWeightedChange: 0,
      totalWeight: 0,
      exercises: [],
    },
    Shoulders: {
      totalWeightedChange: 0,
      totalWeight: 0,
      exercises: [],
    },
    Biceps: {
      totalWeightedChange: 0,
      totalWeight: 0,
      exercises: [],
    },
    Triceps: {
      totalWeightedChange: 0,
      totalWeight: 0,
      exercises: [],
    },
    Legs: {
      totalWeightedChange: 0,
      totalWeight: 0,
      exercises: [],
    },
  };

  // Separate exercise buckets for each leg subgroup
  const legExerciseBuckets: Record<
    LegMuscleGroup,
    TopExercise[]
  > = {
    Quads: [],
    Hamstrings: [],
    Glutes: [],
    Calves: [],
    Adductors: [],
  };

  exerciseComparison.forEach(
    (data, exerciseName) => {
      let exChange = 0;

      if (
        data.baseE1rm > 0 &&
        data.recentE1rm > 0
      ) {
        exChange =
          ((data.recentE1rm -
            data.baseE1rm) /
            data.baseE1rm) *
          100;

        const weight =
          data.acuteSets +
          data.chronicSets;

        muscleStrengthChanges[
          data.muscle
        ].totalWeightedChange +=
          exChange * weight;

        muscleStrengthChanges[
          data.muscle
        ].totalWeight += weight;
      } else if (
        data.baseE1rm === 0 &&
        data.recentE1rm > 0
      ) {
        exChange = 100;
      }

      if (data.acuteSets <= 0) {
        return;
      }

      const exercise: TopExercise = {
        exerciseName,
        currentE1RM: data.recentE1rm,
        baselineE1RM:
          data.baseE1rm > 0
            ? data.baseE1rm
            : data.recentE1rm,
        percentChange:
          Math.round(exChange * 10) /
          10,
        currentSets:
          data.acuteSets,
      };

      muscleStrengthChanges[
        data.muscle
      ].exercises.push(exercise);

      // Add leg exercises to their specific subgroup
      if (
        data.muscle === "Legs" &&
        data.legMuscle
      ) {
        legExerciseBuckets[
          data.legMuscle
        ].push(exercise);
      }
    }
  );

  const calcChange = (
    current: number,
    base: number
  ) => {
    if (
      base === 0 &&
      current === 0
    ) {
      return 0;
    }

    if (
      base === 0 &&
      current > 0
    ) {
      return 100;
    }

    return Math.round(
      ((current - base) /
        base) *
        1000
    ) / 10;
  };

  const totalAcuteSets =
    Object.values(
      acuteSetsPerMuscle
    ).reduce(
      (a, b) => a + b,
      0
    );

  const totalChronicAvg =
    Object.values(
      chronicSetsPerMuscle
    ).reduce(
      (a, b) => a + b,
      0
    ) / 4;

  const overallVolumeChange =
    calcChange(
      totalAcuteSets,
      totalChronicAvg
    );

  // ============================================================
  // Build final summaries
  // ============================================================

  const muscleGroupSummaries =
    {} as Record<
      MuscleGroup,
      MuscleGroupSummary
    >;

  let overallWeightedStrengthChange = 0;
  let overallStrengthWeight = 0;

  MUSCLE_GROUPS.forEach(
    (group) => {
      const mData =
        muscleStrengthChanges[
          group
        ];

      const strengthChange =
        mData.totalWeight > 0
          ? Math.round(
              (mData.totalWeightedChange /
                mData.totalWeight) *
                10
            ) / 10
          : 0;

      const currentSets =
        acuteSetsPerMuscle[
          group
        ];

      // Baseline is trailing 4-week average
      const avgWeeklySets =
        Math.round(
          (chronicSetsPerMuscle[
            group
          ] / 4) *
            10
        ) / 10;

      const volumeChange =
        calcChange(
          currentSets,
          avgWeeklySets
        );

      const topExercises =
        mData.exercises
          .sort(
            (a, b) =>
              b.currentSets -
              a.currentSets
          )
          .slice(0, 3);

      const summary: MuscleGroupSummary =
        {
          strengthChange,
          volumeChange,
          currentVolume:
            currentSets,
          baselineVolume:
            avgWeeklySets,
          topExercises,
        };

      // Add leg subgroup data
      if (group === "Legs") {
        const legMuscles =
          {} as Record<
            LegMuscleGroup,
            LegMuscleSummary
          >;

        LEG_MUSCLE_GROUPS.forEach(
          (legMuscle) => {
            const exercises =
              legExerciseBuckets[
                legMuscle
              ]
                .sort(
                  (a, b) =>
                    b.currentSets -
                    a.currentSets
                )
                .slice(0, 3);

            legMuscles[
              legMuscle
            ] = {
              muscle:
                legMuscle,
              topExercises:
                exercises,
            };
          }
        );

        summary.legMuscles =
          legMuscles;
      }

      muscleGroupSummaries[
        group
      ] = summary;

      if (
        mData.totalWeight > 0 &&
        group !== "Biceps" &&
        group !== "Triceps"
      ) {
        overallWeightedStrengthChange +=
          mData.totalWeightedChange;

        overallStrengthWeight +=
          mData.totalWeight;
      }
    }
  );

  const overallStrengthChange =
    overallStrengthWeight > 0
      ? Math.round(
          (overallWeightedStrengthChange /
            overallStrengthWeight) *
            10
        ) / 10
      : 0;

  return {
    overallStrengthChange,
    overallVolumeChange,
    muscleGroups:
      muscleGroupSummaries,
    weeklyTrend: [],
  };
}