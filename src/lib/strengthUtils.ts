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

  // Best e1RM achieved during the previous 28-day baseline.
  baselineE1RM: number;

  // Current e1RM vs baseline e1RM.
  percentChange: number;

  // Current 7-day volume vs average weekly
  // volume across the previous 4 completed weeks.
  volumeChange: number;

  // Actual current 7-day volume.
  currentVolume: number;

  // Total volume across the complete 35-day
  // trend window, used only to rank top exercises.
  trendVolume: number;

  // True when the exercise has current activity
  // but no activity during the previous 28-day baseline.
  isNew: boolean;
};

export type LegSubGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual volume = weight × reps.
  currentVolume: number;

  // Average weekly volume across the previous
  // 4 completed weeks.
  baselineVolume: number;

  topExercises: TopExercise[];
};

export type MuscleGroupSummary = {
  strengthChange: number;
  volumeChange: number;

  // Actual volume during the current 7-day window.
  currentVolume: number;

  // Average weekly volume across the previous
  // 4 completed weeks.
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

/**
 * Calculates volume change using:
 *
 * CURRENT:
 *   Most recent 7 days.
 *
 * BASELINE:
 *   The previous 28 days ONLY.
 *   The current 7-day window is completely excluded.
 *
 * This gives:
 *
 *   Current Week vs Previous 4-Week Average
 */
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

/**
 * Creates the display-ready exercise object.
 *
 * NEW means:
 *
 * - The exercise has current 7-day activity.
 * - The exercise had ZERO volume during the
 *   previous 28-day baseline.
 *
 * The underlying numerical values remain available
 * for calculations, while the UI can display "NEW"
 * instead of "+100%".
 */
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

  let strengthChange =
    0;

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
    /*
     * No previous e1RM baseline.
     *
     * Keep 100 internally for compatibility.
     * The UI uses isNew to display NEW.
     */
    strengthChange = 100;
  } else if (
    data.baseE1rm > 0 &&
    data.recentE1rm === 0
  ) {
    /*
     * Exercise was present in the previous
     * 28-day baseline but has no current
     * e1RM because it is no longer being used.
     *
     * This represents a 100% reduction.
     */
    strengthChange = -100;
  }

  const volumeChange =
    calculateVolumeChange(
      data.acuteVolume,
      data.chronicVolume
    );

  /*
   * Total volume across the entire 35-day
   * comparison period.
   *
   * This is used to determine which exercises
   * are the "Top Exercises (4-Week Trend)".
   *
   * It deliberately includes both:
   *
   * - Current 7-day volume
   * - Previous 28-day volume
   */
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
   * ============================================================
   * CURRENT 7 DAYS
   * ============================================================
   */
  const acuteWindowStart =
    now -
    7 *
      MS_PER_DAY;

  /*
   * ============================================================
   * PREVIOUS 28 DAYS
   * ============================================================
   *
   * The current 7-day window is deliberately excluded.
   *
   * Total analysis window:
   *
   * Previous 28 days + Current 7 days = 35 days
   */
  const baselineWindowStart =
    now -
    35 *
      MS_PER_DAY;

  const baselineWindowEnd =
    acuteWindowStart;

  /*
   * Only valid sets inside the full
   * 35-day comparison window are considered.
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
          baselineWindowStart &&
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
   * ============================================================
   * EXERCISE DATA
   * ============================================================
   *
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

  /*
   * Previous 4-week volume per muscle.
   *
   * This deliberately EXCLUDES the current
   * 7-day acute window.
   */
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

      /*
       * Only dates before the current 7-day
       * window belong to the previous
       * four-week baseline.
       */
      const isBaseline =
        time >=
          baselineWindowStart &&
        time <
          baselineWindowEnd;

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
       * CURRENT 7-DAY WINDOW
       */
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
         * 7-day window.
         */
        if (
          e1rm >
          entry.recentE1rm
        ) {
          entry.recentE1rm =
            e1rm;
        }
      }

      /*
       * PREVIOUS 4-WEEK BASELINE
       */
      if (isBaseline) {
        entry.chronicSets += 1;

        entry.chronicVolume +=
          setVolume;

        chronicVolumePerMuscle[
          muscle
        ] += setVolume;

        /*
         * Best e1RM from the previous
         * 28-day baseline.
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
   * ============================================================
   * STRENGTH AGGREGATION
   * ============================================================
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
   * ============================================================
   * EXERCISE-LEVEL METRICS
   * ============================================================
   *
   * IMPORTANT:
   *
   * Every exercise that has appeared during the
   * complete 35-day analysis window is eligible
   * for the Top Exercises list.
   *
   * There is NO "must be performed twice" rule.
   *
   * An exercise performed once qualifies.
   *
   * An exercise performed only during the previous
   * 28 days also qualifies.
   *
   * The final list is ranked by total 35-day
   * volume and limited to 3.
   */
  exerciseProgress.forEach(
    (data) => {
      /*
       * Every exercise gets a display-ready
       * trend object, including exercises that
       * are no longer in the current rotation.
       */
      const exercise =
        createTopExercise(
          data
        );

      muscleStrengthChanges[
        data.muscle
      ].exercises.push(
        exercise
      );

      /*
       * Only current 7-day activity contributes
       * to the current muscle-group strength
       * calculation.
       */
      if (
        data.acuteVolume <= 0
      ) {
        return;
      }

      let strengthChange =
        0;

      /*
       * Normal case:
       *
       * Current 7-day best e1RM
       * vs
       * previous 28-day baseline e1RM.
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
         * New exercise:
         *
         * There is no historical strength baseline.
         *
         * It remains NEW at exercise level and
         * is deliberately NOT allowed to distort
         * the muscle-group weighted strength
         * calculation.
         */
      }
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

      const previousFourWeekVolume =
        chronicVolumePerMuscle[
          group
        ];

      /*
       * Average weekly volume across the
       * four completed weeks BEFORE the
       * current week.
       */
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

      /*
       * ========================================================
       * TOP 3 EXERCISES — FULL 35-DAY TREND
       * ========================================================
       *
       * Unlike the old rule, an exercise does NOT
       * need to have been performed twice.
       *
       * It also does NOT need to have been performed
       * during the current 7 days.
       *
       * Ranking is based on total volume across:
       *
       *   Previous 28 days + Current 7 days
       *
       * This makes the drill-down genuinely represent
       * the "4-Week Trend".
       */
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
             * Previous four-week volume.
             *
             * Current week excluded.
             */
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

            /*
             * Average weekly baseline.
             */
            const subgroupBaselineVolume =
              subgroupPreviousFourWeekVolume /
              4;

            /*
             * Subgroup volume change.
             */
            const subgroupVolumeChange =
              calculateVolumeChange(
                subgroupCurrentVolume,
                subgroupPreviousFourWeekVolume
              );

            /*
             * Strength aggregation for the subgroup.
             *
             * Uses actual current exercise volume
             * as the weighting factor.
             */
            let subgroupWeightedStrength =
              0;

            let subgroupStrengthWeight =
              0;

            subgroupExercises.forEach(
              (exercise) => {
                /*
                 * Exercises that are not currently
                 * being performed cannot contribute
                 * to the current strength calculation.
                 */
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

                /*
                 * New exercises do not distort the
                 * subgroup strength average.
                 */
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

            /*
             * ==================================================
             * TOP 3 LEG SUBGROUP EXERCISES
             * ==================================================
             *
             * Same 35-day trend logic as the main
             * muscle groups.
             */
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

      /*
       * Preserve existing overall-strength behaviour:
       *
       * Biceps and Triceps are excluded.
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