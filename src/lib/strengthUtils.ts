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
};

export type TopExercise = {
  exerciseName: string;

  // Best e1RM achieved during the current active training window.
  currentE1RM: number;

  // Best e1RM achieved during the previous baseline window.
  baselineE1RM: number;

  // Current e1RM vs baseline e1RM.
  percentChange: number;

  // Current window volume vs average baseline volume
  volumeChange: number;

  // Actual current window volume.
  currentVolume: number;

  // Total volume across the complete trend window, used only to rank top exercises.
  trendVolume: number;

  // True when the exercise has current activity
  // but no activity during the previous baseline.
  isNew: boolean;
};

export type LegSubGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual volume = weight × reps.
  currentVolume: number;

  // Baseline volume average.
  baselineVolume: number;

  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual volume during the current window.
  currentVolume: number;

  // Baseline volume average.
  baselineVolume: number;

  topExercises: TopExercise[];

  legSubGroups: Record<
    LegSubGroup,
    LegSubGroupSummary
  >;
};

export type ProgressReport = {
  overallStrengthChange: number;
  overallVolumeChange: number;
  muscleGroups: Record<
    MuscleGroup,
    MuscleGroupSummary
  >;
  weeklyTrend: any[];
};

type ExerciseComparison = {
  exerciseName: string;
  muscle: MuscleGroup;

  baseE1rm: number;
  recentE1rm: number;

  acuteVolume: number;
  chronicVolume: number;

  acuteSets: number;
  chronicSets: number;

  recentDates: Set<string>;
};

type ExerciseProgress = {
  exerciseName: string;
  muscle: MuscleGroup;
  legSubGroup: LegSubGroup | null;

  baseE1rm: number;
  recentE1rm: number;

  acuteVolume: number;
  chronicVolume: number;

  acuteSets: number;
  chronicSets: number;
};

export function calculateE1RM(
  weight: number,
  reps: number
): number {
  if (
    reps <= 0 ||
    weight <= 0
  ) {
    return 0;
  }

  if (reps === 1) {
    return weight;
  }

  return (
    Math.round(
      weight *
        (1 + reps / 30) *
        10
    ) / 10
  );
}

function calculateSetVolume(
  weight: number,
  reps: number
): number {
  if (
    weight <= 0 ||
    reps <= 0
  ) {
    return 0;
  }

  return weight * reps;
}

function createEmptyLegSubGroups(): Record<
  LegSubGroup,
  LegSubGroupSummary
> {
  const result =
    {} as Record<
      LegSubGroup,
      LegSubGroupSummary
    >;

  LEG_MUSCLE_GROUPS.forEach(
    (group) => {
      result[group] = {
        strengthChange: 0,
        volumeChange: 0,
        currentVolume: 0,
        baselineVolume: 0,
        topExercises: [],
      };
    }
  );

  return result;
}

function createEmptyMuscleGroups(): Record<
  MuscleGroup,
  MuscleGroupSummary
> {
  const result =
    {} as Record<
      MuscleGroup,
      MuscleGroupSummary
    >;

  MUSCLE_GROUPS.forEach(
    (group) => {
      result[group] = {
        strengthChange: 0,
        volumeChange: 0,
        currentVolume: 0,
        baselineVolume: 0,
        topExercises: [],
        legSubGroups:
          createEmptyLegSubGroups(),
      };
    }
  );

  return result;
}

function calculatePercentChange(
  current: number,
  baseline: number
): number {
  if (
    baseline === 0 &&
    current === 0
  ) {
    return 0;
  }

  if (
    baseline === 0 &&
    current > 0
  ) {
    return 100;
  }

  return (
    Math.round(
      ((current - baseline) /
        baseline) *
        1000
    ) / 10
  );
}

function calculateVolumeChange(
  currentVolume: number,
  previousFourWeekVolume: number
): number {
  if (
    previousFourWeekVolume === 0 &&
    currentVolume === 0
  ) {
    return 0;
  }

  if (
    previousFourWeekVolume === 0 &&
    currentVolume > 0
  ) {
    return 100;
  }

  const baselineWeeklyVolume =
    previousFourWeekVolume / 4;

  return calculatePercentChange(
    currentVolume,
    baselineWeeklyVolume
  );
}

function createTopExercise(
  data: ExerciseProgress
): TopExercise {
  const hasCurrentActivity =
    data.acuteVolume > 0;

  const hasBaselineActivity =
    data.chronicVolume > 0;

  const isNew =
    hasCurrentActivity &&
    !hasBaselineActivity;

  let strengthChange = 0;

  if (
    data.baseE1rm > 0 &&
    data.recentE1rm > 0
  ) {
    strengthChange =
      ((data.recentE1rm -
        data.baseE1rm) /
        data.baseE1rm) *
      100;
  } else if (
    data.baseE1rm === 0 &&
    data.recentE1rm > 0
  ) {
    strengthChange = 100;
  } else if (
    data.baseE1rm > 0 &&
    data.recentE1rm === 0
  ) {
    strengthChange = -100;
  }

  const volumeChange =
    calculateVolumeChange(
      data.acuteVolume,
      data.chronicVolume
    );

  const trendVolume =
    data.acuteVolume +
    data.chronicVolume;

  return {
    exerciseName:
      data.exerciseName,

    currentE1RM:
      data.recentE1rm,

    baselineE1RM:
      data.baseE1rm > 0
        ? data.baseE1rm
        : data.recentE1rm,

    percentChange:
      Math.round(
        strengthChange * 10
      ) / 10,

    volumeChange,

    currentVolume:
      Math.round(
        data.acuteVolume * 10
      ) / 10,

    trendVolume:
      Math.round(
        trendVolume * 10
      ) / 10,

    isNew,
  };
}

export function calculateTrainingProgress(
  sets: WorkoutSet[]
): ProgressReport {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const now = endOfToday.getTime();
  const MS_PER_DAY = 86_400_000;

  // Sort sets descending by date to establish session-based windows
  const sortedSets = [...sets].filter((s) => {
    if (!s || !s.exerciseName || s.weight <= 0 || s.reps <= 0) return false;
    const parts = s.date.split("-").map(Number);
    return parts.length === 3 && !parts.some(Number.isNaN);
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sortedSets.length === 0) {
    return {
      overallStrengthChange: 0,
      overallVolumeChange: 0,
      muscleGroups:
        createEmptyMuscleGroups(),
      weeklyTrend: [],
    };
  }

  // Get unique workout dates to use the last 4 actual training days as the active window
  const uniqueDates = Array.from(new Set(sortedSets.map(s => s.date)));
  const recentWorkoutDates = new Set(uniqueDates.slice(0, 4));

  const baselineWindowStart = now - 60 * MS_PER_DAY;

  const validSets = sortedSets.filter((s) => {
    const time = new Date(s.date).getTime();
    return !Number.isNaN(time) && time <= now && time >= baselineWindowStart;
  });

  if (validSets.length === 0) {
    return {
      overallStrengthChange: 0,
      overallVolumeChange: 0,
      muscleGroups:
        createEmptyMuscleGroups(),
      weeklyTrend: [],
    };
  }

  const exerciseComparison =
    new Map<
      string,
      ExerciseComparison
    >();

  const acuteVolumePerMuscle: Record<
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

  const chronicVolumePerMuscle: Record<
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

  validSets.forEach(
    (set) => {
      const muscle =
        getMuscleGroupForExercise(
          set.exerciseName
        );

      if (!muscle) {
        return;
      }

      const isAcute = recentWorkoutDates.has(set.date);
      const isBaseline = !isAcute;

      const e1rm =
        calculateE1RM(
          set.weight,
          set.reps
        );

      const setVolume =
        calculateSetVolume(
          set.weight,
          set.reps
        );

      if (
        !exerciseComparison.has(
          set.exerciseName
        )
      ) {
        exerciseComparison.set(
          set.exerciseName,
          {
            exerciseName:
              set.exerciseName,

            muscle,

            baseE1rm: 0,
            recentE1rm: 0,

            acuteVolume: 0,
            chronicVolume: 0,

            acuteSets: 0,
            chronicSets: 0,

            recentDates:
              new Set<string>(),
          }
        );
      }

      const entry =
        exerciseComparison.get(
          set.exerciseName
        )!;

      if (isAcute) {
        entry.acuteSets += 1;
        entry.acuteVolume += setVolume;
        entry.recentDates.add(set.date);
        acuteVolumePerMuscle[muscle] += setVolume;

        if (e1rm > entry.recentE1rm) {
          entry.recentE1rm = e1rm;
        }
      }

      if (isBaseline) {
        entry.chronicSets += 1;
        entry.chronicVolume += setVolume;
        chronicVolumePerMuscle[muscle] += setVolume;

        if (e1rm > entry.baseE1rm) {
          entry.baseE1rm = e1rm;
        }
      }
    }
  );

  const exerciseProgress: ExerciseProgress[] =
    Array.from(
      exerciseComparison.values()
    ).map(
      (data) => ({
        exerciseName:
          data.exerciseName,

        muscle:
          data.muscle,

        legSubGroup:
          data.muscle === "Legs"
            ? getLegSubGroupForExercise(
                data.exerciseName
              )
            : null,

        baseE1rm:
          data.baseE1rm,

        recentE1rm:
          data.recentE1rm,

        acuteVolume:
          data.acuteVolume,

        chronicVolume:
          data.chronicVolume,

        acuteSets:
          data.acuteSets,

        chronicSets:
          data.chronicSets,
      })
    );

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

  exerciseProgress.forEach(
    (data) => {
      const exercise =
        createTopExercise(
          data
        );

      muscleStrengthChanges[
        data.muscle
      ].exercises.push(
        exercise
      );

      if (
        data.acuteVolume <= 0
      ) {
        return;
      }

      let strengthChange = 0;

      if (
        data.baseE1rm > 0 &&
        data.recentE1rm > 0
      ) {
        strengthChange =
          ((data.recentE1rm -
            data.baseE1rm) /
            data.baseE1rm) *
          100;

        muscleStrengthChanges[
          data.muscle
        ].totalWeightedChange +=
          strengthChange *
          data.acuteVolume;

        muscleStrengthChanges[
          data.muscle
        ].totalWeight +=
          data.acuteVolume;
      }
    }
  );

  const totalAcuteVolume =
    Object.values(
      acuteVolumePerMuscle
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const totalPreviousFourWeekVolume =
    Object.values(
      chronicVolumePerMuscle
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const overallVolumeChange =
    calculateVolumeChange(
      totalAcuteVolume,
      totalPreviousFourWeekVolume
    );

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

      const currentVolume =
        acuteVolumePerMuscle[
          group
        ];

      const previousFourWeekVolume =
        chronicVolumePerMuscle[
          group
        ];

      const baselineVolume =
        previousFourWeekVolume /
        4;

      const roundedBaselineVolume =
        Math.round(
          baselineVolume * 10
        ) / 10;

      const volumeChange =
        calculateVolumeChange(
          currentVolume,
          previousFourWeekVolume
        );

      const topExercises = [
        ...mData.exercises,
      ]
        .filter(
          (exercise) =>
            exercise.trendVolume >
            0
        )
        .sort(
          (a, b) =>
            b.trendVolume -
            a.trendVolume
        )
        .slice(0, 3);

      const legSubGroups =
        createEmptyLegSubGroups();

      if (
        group === "Legs"
      ) {
        LEG_MUSCLE_GROUPS.forEach(
          (subGroup) => {
            const subgroupExercises =
              exerciseProgress.filter(
                (exercise) =>
                  exercise.muscle ===
                    "Legs" &&
                  exercise.legSubGroup ===
                    subGroup
              );

            if (
              subgroupExercises.length ===
              0
            ) {
              return;
            }

            const subgroupCurrentVolume =
              subgroupExercises.reduce(
                (
                  sum,
                  exercise
                ) =>
                  sum +
                  exercise.acuteVolume,
                0
              );

            const subgroupPreviousFourWeekVolume =
              subgroupExercises.reduce(
                (
                  sum,
                  exercise
                ) =>
                  sum +
                  exercise.chronicVolume,
                0
              );

            const subgroupBaselineVolume =
              subgroupPreviousFourWeekVolume /
              4;

            const subgroupVolumeChange =
              calculateVolumeChange(
                subgroupCurrentVolume,
                subgroupPreviousFourWeekVolume
              );

            let subgroupWeightedStrength =
              0;

            let subgroupStrengthWeight =
              0;

            subgroupExercises.forEach(
              (exercise) => {
                if (
                  exercise.acuteVolume <=
                  0
                ) {
                  return;
                }

                let exerciseStrengthChange =
                  0;

                if (
                  exercise.baseE1rm >
                    0 &&
                  exercise.recentE1rm >
                    0
                ) {
                  exerciseStrengthChange =
                    ((exercise.recentE1rm -
                      exercise.baseE1rm) /
                      exercise.baseE1rm) *
                    100;
                }

                if (
                  exercise.baseE1rm >
                    0 &&
                  exercise.recentE1rm >
                    0
                ) {
                  subgroupWeightedStrength +=
                    exerciseStrengthChange *
                    exercise.acuteVolume;

                  subgroupStrengthWeight +=
                    exercise.acuteVolume;
                }
              }
            );

            const subgroupStrengthChange =
              subgroupStrengthWeight >
              0
                ? Math.round(
                    (subgroupWeightedStrength /
                      subgroupStrengthWeight) *
                      10
                  ) / 10
                : 0;

            const subgroupTopExercises =
              subgroupExercises
                .filter(
                  (exercise) =>
                    exercise.acuteVolume >
                      0 ||
                    exercise.chronicVolume >
                      0
                )
                .map(
                  (exercise) =>
                    createTopExercise(
                      exercise
                    )
                )
                .sort(
                  (a, b) =>
                    b.trendVolume -
                    a.trendVolume
                )
                .slice(0, 3);

            legSubGroups[
              subGroup
            ] = {
              strengthChange:
                subgroupStrengthChange,

              volumeChange:
                subgroupVolumeChange,

              currentVolume:
                Math.round(
                  subgroupCurrentVolume *
                    10
                ) / 10,

              baselineVolume:
                Math.round(
                  subgroupBaselineVolume *
                    10
                ) / 10,

              topExercises:
                subgroupTopExercises,
            };
          }
        );
      }

      muscleGroupSummaries[
        group
      ] = {
        strengthChange,
        volumeChange,

        currentVolume:
          Math.round(
            currentVolume * 10
          ) / 10,

        baselineVolume:
          roundedBaselineVolume,

        topExercises,

        legSubGroups,
      };

      if (
        mData.totalWeight >
          0 &&
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
    overallStrengthWeight >
    0
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
