import {
  getMuscleGroupForExercise,
  getLegSubGroupForExercise,
  MuscleGroup,
  LegSubGroup,
  MUSCLE_GROUPS,
  LEG_SUBGROUPS,
} from "./strengthMapping";

export type WorkoutSet = {
  exerciseName: string;
  weight: number;
  reps: number;
  date: string; // YYYY-MM-DD
};

export type TopExercise = {
  exerciseName: string;

  // Best e1RM in the current 7-day window.
  currentE1RM: number;

  // Best e1RM from the previous 28-day baseline.
  baselineE1RM: number;

  // Current e1RM vs baseline e1RM.
  percentChange: number;

  // Current 7-day volume vs 4-week average volume.
  volumeChange: number;

  // Current 7-day volume.
  currentVolume: number;
};

export type LegSubGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual training volume:
  // weight × reps across all qualifying sets.
  currentVolume: number;

  // Average weekly volume across the trailing 28 days.
  baselineVolume: number;

  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual training volume in the last 7 days.
  currentVolume: number;

  // Average weekly volume over the trailing 28 days.
  baselineVolume: number;

  topExercises: TopExercise[];

  /*
   * Detailed leg breakdown.
   *
   * Populated for Legs.
   * Empty/default for the other muscle groups.
   */
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

/*
 * Actual training volume.
 *
 * This is deliberately NOT just sets.
 *
 * Example:
 * 100kg × 8 = 800kg volume
 * 100kg × 10 = 1000kg volume
 *
 * Therefore an increase in reps is correctly reflected.
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

  LEG_SUBGROUPS.forEach(
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
   * Chronic baseline:
   * Trailing 28 days.
   */
  const chronicWindowStart =
    now -
    28 *
      MS_PER_DAY;

  const validSets =
    sets.filter((s) => {
      if (
        !s ||
        s.weight <= 0 ||
        s.reps <= 0
      ) {
        return false;
      }

      const parts =
        s.date
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

      return (
        !isNaN(time) &&
        time >=
          chronicWindowStart &&
        time <= now
      );
    });

  if (
    validSets.length ===
    0
  ) {
    const emptyGroups =
      {} as Record<
        MuscleGroup,
        MuscleGroupSummary
      >;

    MUSCLE_GROUPS.forEach(
      (group) => {
        emptyGroups[group] = {
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

    return {
      overallStrengthChange: 0,
      overallVolumeChange: 0,
      muscleGroups:
        emptyGroups,
      weeklyTrend: [],
    };
  }

  /*
   * Every exercise is tracked independently.
   *
   * IMPORTANT:
   * `muscle` is ONLY the primary muscle.
   * Secondary muscles are never added to the
   * Training Momentum calculations.
   */
  const exerciseComparison: Map<
    string,
    {
      muscle: MuscleGroup;

      baseE1rm: number;
      recentE1rm: number;

      acuteVolume: number;
      chronicVolume: number;

      acuteSets: number;
      chronicSets: number;

      recentDates: Set<string>;
    }
  > = new Map();

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
    (s) => {
      /*
       * PRIMARY TARGET ONLY.
       */
      const muscle =
        getMuscleGroupForExercise(
          s.exerciseName
        );

      if (!muscle) {
        return;
      }

      const parts =
        s.date
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

      const e1rm =
        calculateE1RM(
          s.weight,
          s.reps
        );

      const setVolume =
        calculateSetVolume(
          s.weight,
          s.reps
        );

      const isAcute =
        time >=
        acuteWindowStart;

      if (
        !exerciseComparison.has(
          s.exerciseName
        )
      ) {
        exerciseComparison.set(
          s.exerciseName,
          {
            muscle,
            baseE1rm: 0,
            recentE1rm: 0,

            acuteVolume: 0,
            chronicVolume: 0,

            acuteSets: 0,
            chronicSets: 0,

            recentDates:
              new Set(),
          }
        );
      }

      const entry =
        exerciseComparison.get(
          s.exerciseName
        )!;

      /*
       * Every valid set belongs to the
       * trailing 28-day dataset.
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
          s.date
        );

        acuteVolumePerMuscle[
          muscle
        ] += setVolume;

        /*
         * Current strength signal =
         * best e1RM achieved in the
         * current 7-day window.
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
         * Baseline strength signal =
         * best e1RM achieved in the
         * older portion of the
         * trailing 28-day window.
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

  const calcChange = (
    current: number,
    base: number
  ): number => {
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

    return (
      Math.round(
        ((current - base) /
          base) *
          1000
      ) / 10
    );
  };

  /*
   * Build exercise-level analytics.
   */
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

        /*
         * Weight the muscle-level strength
         * calculation by actual current volume.
         *
         * This keeps higher-volume exercises
         * appropriately represented.
         */
        const weighting =
          data.acuteVolume;

        muscleStrengthChanges[
          data.muscle
        ].totalWeightedChange +=
          exChange *
          weighting;

        muscleStrengthChanges[
          data.muscle
        ].totalWeight +=
          weighting;
      } else if (
        data.baseE1rm === 0 &&
        data.recentE1rm > 0
      ) {
        exChange = 100;
      }

      /*
       * Only exercises performed in the
       * current 7-day window appear in
       * the Top Exercises lists.
       */
      if (
        data.acuteVolume > 0
      ) {
        /*
         * Exercise volume baseline:
         *
         * trailing 28-day volume / 4
         *
         * This is the same 7-day vs
         * rolling-28-day methodology
         * used everywhere else.
         */
        const baselineVolume =
          data.chronicVolume /
          4;

        const exerciseVolumeChange =
          calcChange(
            data.acuteVolume,
            baselineVolume
          );

        muscleStrengthChanges[
          data.muscle
        ].exercises.push({
          exerciseName,
          currentE1RM:
            data.recentE1rm,
          baselineE1RM:
            data.baseE1rm > 0
              ? data.baseE1rm
              : data.recentE1rm,

          percentChange:
            Math.round(
              exChange * 10
            ) / 10,

          volumeChange:
            exerciseVolumeChange,

          currentVolume:
            Math.round(
              data.acuteVolume *
                10
            ) / 10,
        });
      }
    }
  );

  /*
   * Overall training volume.
   *
   * Actual volume = weight × reps.
   */
  const totalAcuteVolume =
    Object.values(
      acuteVolumePerMuscle
    ).reduce(
      (a, b) => a + b,
      0
    );

  /*
   * IMPORTANT:
   * We preserve the existing rolling
   * 28-day / 4-week baseline concept.
   */
  const totalChronicWeeklyAverage =
    Object.values(
      chronicVolumePerMuscle
    ).reduce(
      (a, b) => a + b,
      0
    ) / 4;

  const overallVolumeChange =
    calcChange(
      totalAcuteVolume,
      totalChronicWeeklyAverage
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

      /*
       * Baseline = average weekly volume
       * across the trailing 28 days.
       */
      const avgWeeklyVolume =
        Math.round(
          (chronicVolumePerMuscle[
            group
          ] / 4) *
            10
        ) / 10;

      const volumeChange =
        calcChange(
          currentVolume,
          avgWeeklyVolume
        );

      /*
       * Top exercises are ordered by
       * actual current 7-day volume.
       *
       * This means an exercise performed
       * for more meaningful work rises
       * above one with fewer total kg moved.
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
       */
      const legSubGroups =
        createEmptyLegSubGroups();

      if (
        group === "Legs"
      ) {
        LEG_SUBGROUPS.forEach(
          (subGroup) => {
            /*
             * Find all current exercises
             * belonging to this primary
             * leg subgroup.
             */
            const subgroupExercises =
              mData.exercises.filter(
                (exercise) =>
                  getLegSubGroupForExercise(
                    exercise.exerciseName
                  ) ===
                  subGroup
              );

            if (
              subgroupExercises.length ===
              0
            ) {
              return;
            }

            /*
             * Current subgroup volume.
             */
            const subgroupCurrentVolume =
              subgroupExercises.reduce(
                (
                  sum,
                  exercise
                ) =>
                  sum +
                  exercise.currentVolume,
                0
              );

            /*
             * Recover the actual subgroup
             * 28-day baseline volume from
             * each exercise's volume change.
             *
             * volumeChange =
             *   (current - baseline) / baseline
             *
             * Therefore:
             * baseline =
             *   current / (1 + change)
             */
            let subgroupBaselineVolume = 0;

            subgroupExercises.forEach(
              (exercise) => {
                const multiplier =
                  1 +
                  exercise.volumeChange /
                    100;

                if (
                  multiplier >
                  0
                ) {
                  subgroupBaselineVolume +=
                    exercise.currentVolume /
                    multiplier;
                }
              }
            );

            subgroupBaselineVolume =
              Math.round(
                subgroupBaselineVolume *
                  10
              ) / 10;

            const subgroupVolumeChange =
              calcChange(
                subgroupCurrentVolume,
                subgroupBaselineVolume
              );

            /*
             * Subgroup strength is weighted
             * by actual current exercise volume.
             */
            let subgroupWeightedStrength = 0;
            let subgroupStrengthWeight = 0;

            subgroupExercises.forEach(
              (exercise) => {
                subgroupWeightedStrength +=
                  exercise.percentChange *
                  exercise.currentVolume;

                subgroupStrengthWeight +=
                  exercise.currentVolume;
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
             * Top 3 exercises within the
             * specific leg subgroup.
             */
            const subgroupTopExercises =
              [
                ...subgroupExercises,
              ]
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
                subgroupBaselineVolume,

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
          avgWeeklyVolume,

        topExercises,

        legSubGroups,
      };

      /*
       * Overall strength intentionally
       * retains the existing exclusion of
       * direct Biceps/Triceps groups.
       *
       * Primary muscle assignment means
       * pressing/rowing work isn't also
       * counted toward those groups.
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