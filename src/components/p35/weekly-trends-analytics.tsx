import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BarChart3,
  CheckCircle2,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { getActiveHabits } from "@/lib/project35";
import {
  calculateTrainingProgress,
  WorkoutSet,
  TopExercise,
} from "@/lib/strengthUtils";
import {
  MUSCLE_GROUPS,
  LEG_MUSCLE_GROUPS,
  LegSubGroup,
} from "@/lib/strengthMapping";

export function WeeklyTrendsAnalytics() {
  const [isOpen, setIsOpen] = useState(false);

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const [expandedLegSubGroup, setExpandedLegSubGroup] =
    useState<LegSubGroup | null>(null);

  /*
   * ============================================================
   * HEVY DATA
   * ============================================================
   */

  const sets: WorkoutSet[] = useMemo(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw =
        localStorage.getItem("p35_hevy_workouts") ||
        localStorage.getItem("p35_cached_workout");

      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      if (!parsed) {
        return [];
      }

      const extracted: WorkoutSet[] = [];

      const workouts = Array.isArray(parsed) ? parsed : [parsed];

      workouts.forEach((w: any) => {
        if (!w) {
          return;
        }

        const date =
          w.date ||
          w.startTime?.slice(0, 10) ||
          w.start_time?.slice(0, 10) ||
          new Date().toISOString().slice(0, 10);

        const exercises = w.exercises || w.workout_exercises || [];

        if (!Array.isArray(exercises)) {
          return;
        }

        exercises.forEach((ex: any) => {
          if (!ex) {
            return;
          }

          const exerciseName =
            ex.exercise_title || ex.title || ex.exercise?.title || "";

          const exerciseSets = ex.sets || [];

          if (!Array.isArray(exerciseSets)) {
            return;
          }

          exerciseSets.forEach((s: any) => {
            if (!s) {
              return;
            }

            /*
             * Skip warm-up sets so they don't inflate volume.
             * Hevy marks them with type: "warmup". The other checks
             * cover alternative field names in cached data.
             */
            const setType = String(s.type ?? s.set_type ?? "").toLowerCase();

            if (
              setType === "warmup" ||
              setType === "warm_up" ||
              setType === "warm-up" ||
              s.is_warmup === true ||
              s.isWarmup === true
            ) {
              return;
            }

            const rawWeight = s.weightKg ?? s.weight ?? s.weight_kg ?? 0;

            const weight = Number(rawWeight);
            const reps = Number(s.reps ?? 0);

            if (exerciseName && weight > 0 && reps > 0) {
              extracted.push({
                exerciseName,
                weight,
                reps,
                date,
              });
            }
          });
        });
      });

      return extracted;
    } catch (err) {
      console.error("Failed to parse workout history sets:", err);

      return [];
    }
  }, [isOpen]);

  /*
   * ============================================================
   * TRAINING PROGRESS (last 4 weeks vs previous 4 weeks)
   * ============================================================
   */

  const progress = useMemo(() => calculateTrainingProgress(sets), [sets]);

  /*
   * ============================================================
   * ADHERENCE TREND
   * ============================================================
   */

  const trendData = useMemo(() => {
    const weeks: {
      weekLabel: string;
      score: number;
    }[] = [];

    const today = new Date();

    for (let w = 0; w <= 3; w++) {
      const targetDate = new Date(today);

      targetDate.setDate(targetDate.getDate() - w * 7);

      const dayOfWeek = targetDate.getDay();

      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      const monday = new Date(targetDate);

      monday.setDate(targetDate.getDate() - daysSinceMonday);

      let totalPossible = 0;
      let totalCompleted = 0;

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);

        d.setDate(monday.getDate() + i);

        if (d.getTime() > today.getTime() && w === 0) {
          break;
        }

        const k = d.toISOString().slice(0, 10);

        const isWeekend = d.getDay() === 0 || d.getDay() === 6;

        const dayHabits = getActiveHabits(d);

        let parsedHabits: Record<string, boolean> = {};

        const raw =
          typeof window === "undefined"
            ? null
            : localStorage.getItem(`p35_habits_${k}`);

        if (raw) {
          try {
            parsedHabits = JSON.parse(raw);
          } catch {
            parsedHabits = {};
          }
        }

        dayHabits.forEach((h) => {
          const labelLower = h.label.toLowerCase();

          const isLegacyWeekday =
            h.key === "workout_complete" ||
            h.key === "early_morning" ||
            labelLower.includes("workout") ||
            /\d{1,2}:\d{2}\s*[ap]m/i.test(labelLower);

          const isWeekdayOnly = h.isWeekdayOnly ?? isLegacyWeekday;

          if (isWeekend && isWeekdayOnly) {
            return;
          }

          totalPossible++;

          if (parsedHabits[h.key]) {
            totalCompleted++;
          }
        });
      }

      const habitScore =
        totalPossible > 0 ? (totalCompleted / totalPossible) * 100 : 0;

      const mondayKey = monday.toISOString().slice(0, 10);

      let protocolScore = -1;

      try {
        const rawProtocol =
          typeof window === "undefined"
            ? null
            : localStorage.getItem(`p35_weekly_protocol_${mondayKey}`);

        if (rawProtocol) {
          const protocolGoals = JSON.parse(rawProtocol);

          if (Array.isArray(protocolGoals) && protocolGoals.length > 0) {
            const completedCount = protocolGoals.filter(
              (g: any) => g.completed || g.status === "completed"
            ).length;

            protocolScore = Math.round(
              (completedCount / protocolGoals.length) * 100
            );
          }
        }
      } catch {
        protocolScore = -1;
      }

      let finalScore = Math.round(habitScore);

      if (protocolScore >= 0) {
        finalScore = Math.round(habitScore * 0.7 + protocolScore * 0.3);
      }

      const weekLabel = `Week of ${monday.toLocaleDateString("en-GB", {
        month: "short",
        day: "numeric",
      })}`;

      weeks.push({
        weekLabel,
        score: Math.min(100, Math.max(0, finalScore)),
      });
    }

    return weeks;
  }, [isOpen]);

  const averageScore = useMemo(() => {
    const validWeeks = trendData.filter((w) => w.score > 0);

    if (validWeeks.length === 0) {
      return 0;
    }

    return Math.round(
      validWeeks.reduce((acc, curr) => acc + curr.score, 0) / validWeeks.length
    );
  }, [trendData]);

  /*
   * ============================================================
   * CHANGE BADGE
   * ============================================================
   *
   * isNew   = true  → primary-coloured "NEW" (instead of +100%)
   * hasData = false → grey "—"
   */

  const renderChangeBadge = (
    val: number,
    hasData: boolean,
    isNew: boolean = false
  ) => {
    if (isNew) {
      return <span className="text-primary font-semibold">NEW</span>;
    }

    if (!hasData) {
      return <span className="text-muted-foreground">—</span>;
    }

    if (val > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-emerald-500 font-semibold">
          +{val}%
          <ArrowUpRight className="size-3.5" />
        </span>
      );
    }

    if (val < 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-rose-500 font-semibold">
          {val}%
          <ArrowDownRight className="size-3.5" />
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground font-semibold">
        0.0% →
      </span>
    );
  };

  /*
   * ============================================================
   * EXERCISE TREND ROW
   * ============================================================
   *
   * Strength column: best e1RM, last 4 weeks vs previous 4 weeks.
   * Volume column:   tonnage (weight × reps), same windows.
   *
   * NEW exercises     → "NEW" (instead of +100%)
   * Dropped exercises → grey "—" (instead of -100%)
   */

  const renderExerciseTrend = (exercise: TopExercise, idx: number) => {
    const e1rmPositive = exercise.percentChange > 0;
    const e1rmNegative = exercise.percentChange < 0;

    const volumePositive = exercise.volumeChange > 0;
    const volumeNegative = exercise.volumeChange < 0;

    const strengthClass = exercise.isDropped
      ? "text-muted-foreground"
      : exercise.isNew
        ? "text-primary font-semibold"
        : e1rmPositive
          ? "text-emerald-500 font-semibold"
          : e1rmNegative
            ? "text-rose-500 font-semibold"
            : "text-muted-foreground font-semibold";

    const volumeClass = exercise.isDropped
      ? "text-muted-foreground"
      : exercise.isNew
        ? "text-primary font-semibold"
        : volumePositive
          ? "text-emerald-500 font-semibold"
          : volumeNegative
            ? "text-rose-500 font-semibold"
            : "text-muted-foreground font-semibold";

    const strengthText = exercise.isDropped
      ? "—"
      : exercise.isNew
        ? "NEW"
        : `${exercise.percentChange > 0 ? "+" : ""}${exercise.percentChange}%`;

    const volumeText = exercise.isDropped
      ? "—"
      : exercise.isNew
        ? "NEW"
        : `${exercise.volumeChange > 0 ? "+" : ""}${exercise.volumeChange}%`;

    return (
      <div
        key={`${exercise.exerciseName}-${idx}`}
        className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-2 text-xs py-1.5 border-t border-border/20 first:border-0"
      >
        <span
          className={`truncate min-w-0 ${
            exercise.isDropped ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {exercise.exerciseName}
        </span>

        <span className={`w-14 text-right ${strengthClass}`}>
          {strengthText}
        </span>

        <span className={`w-14 text-right ${volumeClass}`}>{volumeText}</span>
      </div>
    );
  };

  /*
   * ============================================================
   * GROUP TOGGLE
   * ============================================================
   */

  const handleGroupToggle = (
    group: string,
    hasActivity: boolean,
    isExpanded: boolean
  ) => {
    if (!hasActivity) {
      return;
    }

    const nextExpanded = isExpanded ? null : group;

    setExpandedGroup(nextExpanded);

    if (group !== "Legs" || isExpanded) {
      setExpandedLegSubGroup(null);
    }
  };

  const overallHasBaseline = progress.overallBaselineSets > 0;
  const overallIsNew =
    progress.overallBaselineSets === 0 && progress.overallCurrentSets > 0;

  return (
    <div className="w-full">
      {/* ========================================================
          CARD / TRIGGER
          ======================================================== */}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);

          if (!open) {
            setExpandedGroup(null);
            setExpandedLegSubGroup(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <div className="panel flex items-center justify-between p-4 cursor-pointer hover:border-primary/50 transition-colors w-full gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <BarChart3 className="size-5 shrink-0 text-primary" />

              <div className="min-w-0 w-full text-left">
                <p className="text-sm font-bold truncate text-foreground">
                  Weekly Trends & Analytics
                </p>

                <p className="text-xs text-muted-foreground truncate w-full">
                  Review 4-week compliance history
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="pointer-events-none gap-1.5 h-8 text-xs shrink-0 min-w-[84px] justify-center"
            >
              <BarChart3 className="size-3.5" />
              <span>Trends</span>
            </Button>
          </div>
        </DialogTrigger>

        {/* ======================================================
            ANALYTICS DIALOG
            ====================================================== */}

        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              Performance Analytics
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* ==================================================
                ADHERENCE SUMMARY
                ================================================== */}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-surface-2/60 p-3 text-center space-y-1">
                <p className="stat-label flex items-center justify-center gap-1">
                  <CheckCircle2 className="size-3.5 text-primary" />
                  <span>4-Week Avg Adherence</span>
                </p>

                <p className="font-display text-2xl font-bold text-primary">
                  {averageScore}%
                </p>
              </div>

              <div className="rounded-lg border border-border bg-surface-2/60 p-3 text-center space-y-1">
                <p className="stat-label flex items-center justify-center gap-1">
                  <Flame className="size-3.5 text-amber-500" />
                  <span>Execution Status</span>
                </p>

                <p className="text-sm font-semibold text-foreground pt-1">
                  {averageScore >= 80
                    ? "Top form, keep it up!"
                    : averageScore >= 50
                      ? "Building Momentum, push harder"
                      : "Absolutely shite, switch on!"}
                </p>
              </div>
            </div>

            {/* ==================================================
                WEEKLY ADHERENCE
                ================================================== */}

            <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rolling 4 Week Adherence
              </p>

              <div className="space-y-3 pt-1">
                {trendData.map((week, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-foreground">{week.weekLabel}</span>

                      <span className="text-primary font-semibold">
                        {week.score}%
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-border/65">
                      <div
                        className="h-full bg-primary transition-all duration-500 rounded-full"
                        style={{ width: `${week.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              Adherence is calculated dynamically based on weekday rules and
              weekly execution protocol targets.
            </p>

            {/* ==================================================
                TRAINING MOMENTUM
                ================================================== */}

            <div className="mt-6 pt-5 border-t border-border space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Training Momentum
                </h3>

                <p className="text-xs text-muted-foreground">
                  Last 4 weeks vs previous 4 weeks
                </p>
              </div>

              {/* ==================================================
                  OVERALL
                  ================================================== */}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-surface-2/60 p-3.5 text-center space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Strength
                  </p>

                  <div className="font-display text-xl font-bold pt-1">
                    {renderChangeBadge(
                      progress.overallStrengthChange,
                      overallHasBaseline
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-surface-2/60 p-3.5 text-center space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Volume (sets)
                  </p>

                  <div className="font-display text-xl font-bold pt-1">
                    {renderChangeBadge(
                      progress.overallVolumeChange,
                      overallHasBaseline,
                      overallIsNew
                    )}
                  </div>
                </div>
              </div>

              {/* ==================================================
                  MUSCLE GROUP TABLE
                  ================================================== */}

              <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/40 p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 pb-2 border-b border-border/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Muscle Groups</span>

                  <span className="w-16 text-right">Strength</span>

                  <span className="w-16 text-right">Sets</span>
                </div>

                <div className="space-y-3 pt-1">
                  {MUSCLE_GROUPS.map((group) => {
                    const data = progress.muscleGroups[group];

                    const hasActivity =
                      data && (data.currentSets > 0 || data.baselineSets > 0);

                    const isExpanded = expandedGroup === group;

                    // NEW at group level: trained now, nothing in the baseline.
                    const groupIsNew =
                      data && data.baselineSets === 0 && data.currentSets > 0;

                    return (
                      <div
                        key={group}
                        className="border-b border-border/40 last:border-0 pb-1"
                      >
                        <div
                          onClick={() =>
                            handleGroupToggle(group, hasActivity, isExpanded)
                          }
                          className={`grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 text-sm py-2 px-2 rounded-lg transition-colors ${
                            hasActivity
                              ? "cursor-pointer hover:bg-surface-2/80"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-foreground truncate">
                              {group}
                            </span>

                            {hasActivity &&
                              (group === "Legs"
                                ? LEG_MUSCLE_GROUPS.some(
                                    (subGroup) =>
                                      data.legSubGroups[subGroup].topExercises
                                        .length > 0
                                  )
                                : data.topExercises.length > 0) && (
                                <ChevronDown
                                  className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              )}
                          </div>

                          <div className="w-16 text-right">
                            {renderChangeBadge(
                              data.strengthChange,
                              hasActivity && data.baselineSets > 0
                            )}
                          </div>

                          <div className="w-16 text-right">
                            {renderChangeBadge(
                              data.volumeChange,
                              hasActivity,
                              groupIsNew
                            )}
                          </div>
                        </div>

                        {/* ==================================================
                            NON-LEG MUSCLE GROUPS
                            ================================================== */}

                        {isExpanded &&
                          group !== "Legs" &&
                          data.topExercises.length > 0 && (
                            <div className="pb-3 pt-1 px-3 space-y-2 bg-surface-2/30 rounded-b-lg border-x border-b border-border/40 mb-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Top Exercises (4-Week Trend)
                              </p>

                              {data.topExercises.map((exercise, idx) =>
                                renderExerciseTrend(exercise, idx)
                              )}
                            </div>
                          )}

                        {/* ==================================================
                            LEGS → SUBGROUPS
                            ================================================== */}

                        {isExpanded && group === "Legs" && (
                          <div className="pb-3 pt-1 px-3 space-y-2 bg-surface-2/30 rounded-b-lg border-x border-b border-border/40 mb-2">
                            <div className="space-y-1">
                              {LEG_MUSCLE_GROUPS.map((subGroup) => {
                                const subData = data.legSubGroups[subGroup];

                                const hasSubActivity =
                                  subData &&
                                  (subData.currentSets > 0 ||
                                    subData.baselineSets > 0);

                                const hasExercises =
                                  subData.topExercises.length > 0;

                                const isSubExpanded =
                                  expandedLegSubGroup === subGroup;

                                const subIsNew =
                                  subData.baselineSets === 0 &&
                                  subData.currentSets > 0;

                                return (
                                  <div
                                    key={subGroup}
                                    className="border-b border-border/20 last:border-0"
                                  >
                                    <div
                                      onClick={() => {
                                        if (!hasSubActivity || !hasExercises) {
                                          return;
                                        }

                                        setExpandedLegSubGroup(
                                          isSubExpanded ? null : subGroup
                                        );
                                      }}
                                      className={`grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 text-xs py-2 px-2 rounded-md transition-colors ${
                                        hasSubActivity && hasExercises
                                          ? "cursor-pointer hover:bg-surface-2/80"
                                          : "opacity-60"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {hasSubActivity && hasExercises ? (
                                          <ChevronDown
                                            className={`size-3 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                              isSubExpanded ? "rotate-180" : ""
                                            }`}
                                          />
                                        ) : (
                                          <span className="size-3 shrink-0" />
                                        )}

                                        <span className="font-semibold text-foreground truncate">
                                          {subGroup}
                                        </span>
                                      </div>

                                      <div className="w-16 text-right">
                                        {renderChangeBadge(
                                          subData.strengthChange,
                                          hasSubActivity &&
                                            subData.baselineSets > 0
                                        )}
                                      </div>

                                      <div className="w-16 text-right">
                                        {renderChangeBadge(
                                          subData.volumeChange,
                                          hasSubActivity,
                                          subIsNew
                                        )}
                                      </div>
                                    </div>

                                    {/* ==================================================
                                        SUBGROUP → EXERCISES
                                        ================================================== */}

                                    {isSubExpanded && hasExercises && (
                                      <div className="ml-4 mr-1 mb-2 px-2.5 py-2 rounded-md bg-surface-2/40 border border-border/30 space-y-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-1">
                                          Top Exercises (4-Week Trend)
                                        </p>

                                        {subData.topExercises.map(
                                          (exercise, idx) =>
                                            renderExerciseTrend(exercise, idx)
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              Compares your last 4 weeks against the 4 weeks before. Headline
              and muscle group volume count working sets. Strength is your best
              estimated 1RM, and exercise volume is weight × reps. Warm-up sets
              are excluded. "—" on an exercise means it wasn't performed in the
              last 4 weeks.
            </p>

            {/* ==================================================
                HEVY LINK
                ================================================== */}

            <div className="pt-2">
              <a
                href="hevy://"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/60 hover:bg-surface-2 py-2.5 text-xs font-semibold text-foreground transition-colors"
              >
                <ExternalLink className="size-3.5 text-primary" />
                Open Hevy App
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
