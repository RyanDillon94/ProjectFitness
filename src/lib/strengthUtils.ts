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

  // Best e1RM achieved during the current 7-day window.
  currentE1RM: number;

  // Best e1RM achieved during the previous 21 days
  // inside the trailing 28-day window.
  baselineE1RM: number;

  // Current e1RM vs baseline e1RM.
  percentChange: number;

  // Current 7-day volume vs average weekly
  // volume across the trailing 28 days.
  volumeChange: number;

  // Actual current 7-day volume.
  currentVolume: number;
};

export type LegSubGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual volume = weight × reps.
  currentVolume: number;

  // Average weekly volume across 28 days.
  baselineVolume: number;

  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual volume during the last 7 days.
  currentVolume: number;

  // Average weekly volume during the trailing 28 days.
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

/**
 * Actual training volume.
 *
 * Volume = weight × reps
 *
 * This means:
 *
 * 100kg × 8 × 3 sets = 2,400kg
 * 100kg × 10 × 3 sets = 3,000kg
 *
 * So increased reps are correctly reflected even
 * when the number of sets stays exactly the same.
 */
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

export function calculateTrainingProgress(
  sets: WorkoutSet[]
): ProgressReport {
  const endOfToday =
    new Date();

  endOfToday.setHours(
    23,
    59,
    59,
    999
  );

  const now =
    endOfToday.getTime();

  const MS_PER_DAY =
    86_400_000;

  /*
   * Acute window:
   * Last 7 days.
   */
  const acuteWindowStart =
    now -
    7 *
      MS_PER_DAY;

  /*
   * Chronic window:
   * Trailing 28 days.
   */
  const chronicWindowStart =
    now -
    28 *
      MS_PER_DAY;

  /*
   * Only valid sets inside the trailing
   * 28-day window are considered.
   */
  const validSets =
    sets.filter((s) => {
      if (
        !s ||
        !s.exerciseName ||
        s.weight <= 0 ||
        s.reps <= 0
      ) {
        return false;
      }

      const parts =
        s.date
          .split("-")
          .map(Number);

      if (
        parts.length !== 3 ||
        parts.some(
          (part) =>
            Number.isNaN(part)
        )
      ) {
        return false;
      }

      const time =
        new Date(
          parts[0],
          parts[1] - 1,
          parts[2],
          12,
          0,
          0
        ).getTime();

      return (
        !Number.isNaN(time) &&
        time >=
          chronicWindowStart &&
        time <= now
      );
    });

  if (
    validSets.length ===
    0
  ) {
    return {
      overallStrengthChange: 0,
      overallVolumeChange: 0,
      muscleGroups:
        createEmptyMuscleGroups(),
      weeklyTrend: [],
    };
  }

  /*
   * Each exercise is tracked independently.
   *
   * IMPORTANT:
   * Only the PRIMARY muscle returned by
   * getMuscleGroupForExercise is used.
   *
   * Secondary muscles do NOT receive any volume
   * or strength contribution.
   */
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

      /*
       * Unknown exercises are ignored rather than
       * being assigned to an arbitrary muscle.
       */
      if (!muscle) {
        return;
      }

      const parts =
        set.date
          .split("-")
          .map(Number);

      const time =
        new Date(
          parts[0],
          parts[1] - 1,
          parts[2],
          12,
          0,
          0
        ).getTime();

      const isAcute =
        time >=
        acuteWindowStart;

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

      /*
       * Every valid set belongs to the
       * 28-day chronic dataset.
       */
      entry.chronicSets += 1;
      entry.chronicVolume +=
        setVolume;

      chronicVolumePerMuscle[
        muscle
      ] += setVolume;

      if (isAcute) {
        entry.acuteSets += 1;
        entry.acuteVolume +=
          setVolume;

        entry.recentDates.add(
          set.date
        );

        acuteVolumePerMuscle[
          muscle
        ] += setVolume;

        /*
         * Best e1RM from the current
         * 7-day acute window.
         */
        if (
          e1rm >
          entry.recentE1rm
        ) {
          entry.recentE1rm =
            e1rm;
        }
      } else {
        /*
         * Best e1RM from the previous
         * portion of the 28-day window.
         */
        if (
          e1rm >
          entry.baseE1rm
        ) {
          entry.baseE1rm =
            e1rm;
        }
      }
    }
  );

  /*
   * Convert raw exercise data into a
   * clean reusable structure.
   */
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

  /*
   * Strength aggregation for each primary muscle.
   */
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

  /*
   * Create exercise-level metrics.
   */
  exerciseProgress.forEach(
    (data) => {
      if (
        data.acuteVolume <= 0
      ) {
        return;
      }

      let strengthChange =
        0;

      /*
       * Normal case:
       * current 7-day best vs previous
       * 21-day baseline.
       */
      if (
        data.baseE1rm > 0 &&
        data.recentE1rm > 0
      ) {
        strengthChange =
          ((data.recentE1rm -
            data.baseE1rm) /
            data.baseE1rm) *
          100;

        /*
         * Weight strength aggregation by
         * actual current exercise volume.
         */
        muscleStrengthChanges[
          data.muscle
        ].totalWeightedChange +=
          strengthChange *
          data.acuteVolume;

        muscleStrengthChanges[
          data.muscle
        ].totalWeight +=
          data.acuteVolume;
      } else if (
        data.baseE1rm === 0 &&
        data.recentE1rm > 0
      ) {
        /*
         * Exercise has no older baseline.
         * Treat it as new 100% progression.
         */
        strengthChange = 100;
      }

      /*
       * Exercise volume baseline:
       *
       * Entire trailing 28-day volume / 4
       *
       * This preserves the existing
       * 7-day vs rolling-4-week logic.
       */
      const baselineVolume =
        data.chronicVolume /
        4;

      const volumeChange =
        calculatePercentChange(
          data.acuteVolume,
          baselineVolume
        );

      muscleStrengthChanges[
        data.muscle
      ].exercises.push({
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
            data.acuteVolume *
              10
          ) / 10,
      });
    }
  );

  /*
   * ============================================================
   * OVERALL VOLUME
   * ============================================================
   */
  const totalAcuteVolume =
    Object.values(
      acuteVolumePerMuscle
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const totalChronicWeeklyAverage =
    Object.values(
      chronicVolumePerMuscle
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    ) / 4;

  const overallVolumeChange =
    calculatePercentChange(
      totalAcuteVolume,
      totalChronicWeeklyAverage
    );

  /*
   * ============================================================
   * MUSCLE GROUP SUMMARIES
   * ============================================================
   */
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

      const baselineVolume =
        chronicVolumePerMuscle[
          group
        ] / 4;

      const roundedBaselineVolume =
        Math.round(
          baselineVolume * 10
        ) / 10;

      const volumeChange =
        calculatePercentChange(
          currentVolume,
          baselineVolume
        );

      /*
       * Top exercises ordered by current
       * actual training volume.
       */
      const topExercises = [
        ...mData.exercises,
      ]
        .sort(
          (a, b) =>
            b.currentVolume -
            a.currentVolume
        )
        .slice(0, 3);

      /*
       * ========================================================
       * LEG SUBGROUPS
       * ========================================================
       *
       * These are calculated DIRECTLY from the raw exercise
       * volume data rather than reconstructing a baseline
       * from percentages.
       */
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

            /*
             * Current 7-day volume.
             */
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

            /*
             * Full trailing 28-day volume.
             */
            const subgroupChronicVolume =
              subgroupExercises.reduce(
                (
                  sum,
                  exercise
                ) =>
                  sum +
                  exercise.chronicVolume,
                0
              );

            /*
             * Average weekly baseline.
             */
            const subgroupBaselineVolume =
              subgroupChronicVolume /
              4;

            /*
             * Subgroup volume change.
             */
            const subgroupVolumeChange =
              calculatePercentChange(
                subgroupCurrentVolume,
                subgroupBaselineVolume
              );

            /*
             * Strength aggregation for the subgroup.
             *
             * Uses actual current exercise volume as
             * the weighting factor.
             */
            let subgroupWeightedStrength =
              0;

            let subgroupStrengthWeight =
              0;

            subgroupExercises.forEach(
              (exercise) => {
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
                } else if (
                  exercise.recentE1rm >
                  0
                ) {
                  exerciseStrengthChange =
                    100;
                }

                subgroupWeightedStrength +=
                  exerciseStrengthChange *
                  exercise.acuteVolume;

                subgroupStrengthWeight +=
                  exercise.acuteVolume;
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

            /*
             * Build the subgroup's exercise list.
             */
            const subgroupTopExercises =
              subgroupExercises
                .filter(
                  (exercise) =>
                    exercise.acuteVolume >
                    0
                )
                .map(
                  (exercise) => {
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
                    } else if (
                      exercise.recentE1rm >
                      0
                    ) {
                      exerciseStrengthChange =
                        100;
                    }

                    const exerciseBaselineVolume =
                      exercise.chronicVolume /
                      4;

                    const exerciseVolumeChange =
                      calculatePercentChange(
                        exercise.acuteVolume,
                        exerciseBaselineVolume
                      );

                    return {
                      exerciseName:
                        exercise.exerciseName,

                      currentE1RM:
                        exercise.recentE1rm,

                      baselineE1RM:
                        exercise.baseE1rm >
                        0
                          ? exercise.baseE1rm
                          : exercise.recentE1rm,

                      percentChange:
                        Math.round(
                          exerciseStrengthChange *
                            10
                        ) / 10,

                      volumeChange:
                        exerciseVolumeChange,

                      currentVolume:
                        Math.round(
                          exercise.acuteVolume *
                            10
                        ) / 10,
                    };
                  }
                )
                .sort(
                  (a, b) =>
                    b.currentVolume -
                    a.currentVolume
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

      /*
       * Preserve existing overall-strength behaviour:
       * direct Biceps and Triceps are not included in
       * the overall strength figure.
       */
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