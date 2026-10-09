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
  Lightbulb,
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
  const [expandedLegSubGroup, setExpandedLegSubGroup] = useState<LegSubGroup | null>(null);

  const sets: WorkoutSet[] = useMemo(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("p35_hevy_workouts") || localStorage.getItem("p35_cached_workout");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed) return [];

      const extracted: WorkoutSet[] = [];
      const workouts = Array.isArray(parsed) ? parsed : [parsed];

      workouts.forEach((w: any) => {
        if (!w) return;
        const date = w.date || w.startTime?.slice(0, 10) || w.start_time?.slice(0, 10) || new Date().toISOString().slice(0, 10);
        const exercises = w.exercises || w.workout_exercises || [];
        if (!Array.isArray(exercises)) return;

        exercises.forEach((ex: any) => {
          if (!ex) return;
          const exerciseName = ex.exercise_title || ex.title || ex.exercise?.title || "";
          const exerciseSets = ex.sets || [];
          if (!Array.isArray(exerciseSets)) return;

          exerciseSets.forEach((s: any) => {
            if (!s) return;
            const rawWeight = s.weightKg ?? s.weight ?? s.weight_kg ?? 0;
            const weight = Number(rawWeight);
            const reps = Number(s.reps ?? 0);

            if (exerciseName && weight > 0 && reps > 0) {
              extracted.push({ exerciseName, weight, reps, date });
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

  const progress = useMemo(() => calculateTrainingProgress(sets), [sets]);

  const trendData = useMemo(() => {
    const weeks: { weekLabel: string; score: number }[] = [];
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
        if (d.getTime() > today.getTime() && w === 0) break;

        const k = d.toISOString().slice(0, 10);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const dayHabits = getActiveHabits(d);
        let parsedHabits: Record<string, boolean> = {};

        const raw = typeof window === "undefined" ? null : localStorage.getItem(`p35_habits_${k}`);
        if (raw) {
          try { parsedHabits = JSON.parse(raw); } catch { parsedHabits = {}; }
        }

        dayHabits.forEach((h) => {
          const labelLower = h.label.toLowerCase();
          const isLegacyWeekday = h.key === "workout_complete" || h.key === "early_morning" || labelLower.includes("workout") || /\d{1,2}:\d{2}\s*[ap]m/i.test(labelLower);
          const isWeekdayOnly = h.isWeekdayOnly ?? isLegacyWeekday;
          if (isWeekend && isWeekdayOnly) return;

          totalPossible++;
          if (parsedHabits[h.key]) totalCompleted++;
        });
      }

      const habitScore = totalPossible > 0 ? (totalCompleted / totalPossible) * 100 : 0;
      const mondayKey = monday.toISOString().slice(0, 10);
      let protocolScore = -1;

      try {
        const rawProtocol = typeof window === "undefined" ? null : localStorage.getItem(`p35_weekly_protocol_${mondayKey}`);
        if (rawProtocol) {
          const protocolGoals = JSON.parse(rawProtocol);
          if (Array.isArray(protocolGoals) && protocolGoals.length > 0) {
            const completedCount = protocolGoals.filter((g: any) => g.completed || g.status === "completed").length;
            protocolScore = Math.round((completedCount / protocolGoals.length) * 100);
          }
        }
      } catch {
        protocolScore = -1;
      }

      let finalScore = Math.round(habitScore);
      if (protocolScore >= 0) {
        finalScore = Math.round(habitScore * 0.7 + protocolScore * 0.3);
      }

      const weekLabel = `Week of ${monday.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}`;
      weeks.push({ weekLabel, score: Math.min(100, Math.max(0, finalScore)) });
    }

    return weeks;
  }, [isOpen]);

  const averageScore = useMemo(() => {
    const validWeeks = trendData.filter((w) => w.score > 0);
    if (validWeeks.length === 0) return 0;
    return Math.round(validWeeks.reduce((acc, curr) => acc + curr.score, 0) / validWeeks.length);
  }, [trendData]);

  const getOverallCoachNote = (val: number) => {
    if (val >= 1.5) return "Overall strength is trending up. Keep locking in your nutrition and training intensity—everything is working.";
    if (val <= -2.0) return "Overall strength is dipping. Check recovery or sleep, and consider an extra working set if fatigue allows.";
    return "Strength is holding steady. Ideal for maintaining muscle mass while cutting—stay the course.";
  };

  const getMuscleCoachNote = (val: number, hasData: boolean) => {
    if (!hasData) return "No recent training recorded for this baseline window.";
    if (val >= 1.5) return "Progressing well. Keep current progression scheme.";
    if (val <= -3.0) return "Noticeable drop in e1RM. Monitor recovery or consider adding an incremental set.";
    if (val < 0) return "Slight dip within normal recovery variance. Keep monitoring.";
    return "Holding strong. Optimal retention profile.";
  };

  const renderChangeBadge = (val: number, hasData: boolean) => {
    if (!hasData) {
      return <span className="text-muted-foreground font-semibold">—</span>;
    }

    if (val > 0) {
      return (
        <span className="inline-flex items-center justify-end gap-0.5 text-emerald-500 font-semibold text-sm">
          +{val}%
          <ArrowUpRight className="size-4 shrink-0" />
        </span>
      );
    }

    if (val < 0) {
      return (
        <span className="inline-flex items-center justify-end gap-0.5 text-rose-500 font-semibold text-sm">
          {val}%
          <ArrowDownRight className="size-4 shrink-0" />
        </span>
      );
    }

    return <span className="text-muted-foreground font-semibold text-sm">0.0%</span>;
  };

  const renderExerciseTrend = (exercise: TopExercise, idx: number) => {
    const e1rmPositive = exercise.percentChange > 0;
    const e1rmNegative = exercise.percentChange < 0;

    return (
      <div
        key={`${exercise.exerciseName}-${idx}`}
        className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-2 text-xs py-2 border-t border-border/10 first:border-0"
      >
        <span className="text-foreground truncate min-w-0 font-medium">{exercise.exerciseName}</span>
        <span
          className={`w-20 text-right ${
            exercise.isNew
              ? "text-primary font-semibold"
              : e1rmPositive
                ? "text-emerald-500 font-semibold"
                : e1rmNegative
                  ? "text-rose-500 font-semibold"
                  : "text-muted-foreground font-semibold"
          }`}
        >
          {exercise.isNew ? "NEW" : `${exercise.percentChange > 0 ? "+" : ""}${exercise.percentChange}%`}
        </span>
      </div>
    );
  };

  const handleGroupToggle = (group: string, hasActivity: boolean, isExpanded: boolean) => {
    if (!hasActivity) return;
    const nextExpanded = isExpanded ? null : group;
    setExpandedGroup(nextExpanded);
    if (group !== "Legs" || isExpanded) {
      setExpandedLegSubGroup(null);
    }
  };

  return (
    <div className="w-full">
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
                <p className="text-sm font-bold truncate text-foreground">Weekly Trends & Analytics</p>
                <p className="text-xs text-muted-foreground truncate w-full">Review 4-week compliance history</p>
              </div>
            </div>

            <Button variant="secondary" size="sm" className="pointer-events-none gap-1.5 h-8 text-xs shrink-0 min-w-[84px] justify-center">
              <BarChart3 className="size-3.5" />
              <span>Trends</span>
            </Button>
          </div>
        </DialogTrigger>

        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              Performance Analytics
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* ADHERENCE SUMMARY CARDS */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3 text-center space-y-1">
                <p className="stat-label flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-primary" />
                  <span>4-Week Adherence</span>
                </p>
                <p className="font-display text-xl font-bold text-primary">{averageScore}%</p>
              </div>

              <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3 text-center space-y-1">
                <p className="stat-label flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Flame className="size-3.5 text-amber-500" />
                  <span>Execution Status</span>
                </p>
                <p className="text-xs font-semibold text-foreground pt-0.5">
                  {averageScore >= 80 ? "Top form!" : averageScore >= 50 ? "Push harder" : "Switch on!"}
                </p>
              </div>
            </div>

            {/* ROLLING 4 WEEK ADHERENCE PROGRESS BARS */}
            <div className="space-y-2.5 rounded-xl border border-border/60 bg-surface-2/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rolling 4 Week Adherence</p>
              <div className="space-y-3 pt-1">
                {trendData.map((week, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-foreground">{week.weekLabel}</span>
                      <span className="text-primary font-semibold">{week.score}%</span>
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

            {/* TRAINING MOMENTUM CONTAINER */}
            <div className="rounded-xl border border-border/60 bg-surface-2/20 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Training Momentum</h3>
                  <p className="text-sm font-bold text-foreground">Overall Strength (e1RM)</p>
                </div>
                <div className="font-display text-xl font-bold">
                  {renderChangeBadge(progress.overallStrengthChange, true)}
                </div>
              </div>

              {/* COACH NOTE BANNER */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-surface-2/60 border border-border/40 text-xs">
                <Lightbulb className="size-4 shrink-0 text-primary mt-0.5" />
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Coach Note:</strong> {getOverallCoachNote(progress.overallStrengthChange)}
                </p>
              </div>

              {/* MUSCLE GROUPS LIST */}
              <div className="space-y-1 pt-1">
                <div className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Muscle Groups</span>
                  <span className="w-[90px] text-right">Strength</span>
                </div>

                {MUSCLE_GROUPS.map((group) => {
                  const data = progress.muscleGroups[group];
                  const hasActivity = data && (data.currentVolume > 0 || data.baselineVolume > 0);
                  const isExpanded = expandedGroup === group;
                  const val = data?.strengthChange || 0;

                  const subStatus = !hasActivity 
                    ? "No recent data" 
                    : val >= 1.0 
                      ? "Trending upward" 
                      : val <= -1.0 
                        ? "Dipping slightly" 
                        : "Holding steady";

                  return (
                    <div key={group} className="border-b border-border/30 last:border-0">
                      <div
                        onClick={() => handleGroupToggle(group, hasActivity, isExpanded)}
                        className={`grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2 py-3 px-2 rounded-lg transition-colors ${
                          hasActivity ? "cursor-pointer hover:bg-surface-2/60" : "opacity-50"
                        }`}
                      >
                        <div className="flex items-center justify-between min-w-0 pr-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{group}</p>
                            <span className="text-[11px] text-muted-foreground truncate font-normal">({subStatus})</span>
                          </div>
                          {hasActivity &&
                            (group === "Legs"
                              ? LEG_MUSCLE_GROUPS.some((subGroup) => data.legSubGroups[subGroup].topExercises.length > 0)
                              : data.topExercises.length > 0) && (
                              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                            )}
                        </div>

                        <div className="w-[90px] text-right">
                          {renderChangeBadge(val, hasActivity && data.baselineVolume > 0)}
                        </div>
                      </div>

                      {/* EXPANDED DRAWER */}
                      {isExpanded && group !== "Legs" && data.topExercises.length > 0 && (
                        <div className="pb-3 pt-2 px-3 space-y-3 bg-surface-2/40 rounded-xl mb-2 border border-border/40">
                          <div className="flex items-start gap-2 p-2 rounded-lg bg-surface-2/60 text-xs">
                            <Lightbulb className="size-3.5 shrink-0 text-primary mt-0.5" />
                            <p className="text-muted-foreground leading-relaxed">
                              {getMuscleCoachNote(data.strengthChange, hasActivity && data.baselineVolume > 0)}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Exercises (4-Week Trend)</p>
                            {data.topExercises.map((exercise, idx) => renderExerciseTrend(exercise, idx))}
                          </div>
                        </div>
                      )}

                      {isExpanded && group === "Legs" && (
                        <div className="pb-3 pt-2 px-3 space-y-2 bg-surface-2/40 rounded-xl mb-2 border border-border/40">
                          <div className="space-y-1">
                            {LEG_MUSCLE_GROUPS.map((subGroup) => {
                              const subData = data.legSubGroups[subGroup];
                              const hasSubActivity = subData && (subData.currentVolume > 0 || subData.baselineVolume > 0);
                              const hasExercises = subData.topExercises.length > 0;
                              const isSubExpanded = expandedLegSubGroup === subGroup;

                              return (
                                <div key={subGroup} className="border-b border-border/10 last:border-0">
                                  <div
                                    onClick={() => {
                                      if (!hasSubActivity || !hasExercises) return;
                                      setExpandedLegSubGroup(isSubExpanded ? null : subGroup);
                                    }}
                                    className={`grid grid-cols-[minmax(0,1fr)_80px] items-center gap-2 text-xs py-2 px-2 rounded-md transition-colors ${
                                      hasSubActivity && hasExercises ? "cursor-pointer hover:bg-surface-2/60" : "opacity-60"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {hasSubActivity && hasExercises ? (
                                        <ChevronDown className={`size-3 shrink-0 text-muted-foreground transition-transform duration-200 ${isSubExpanded ? "rotate-180" : ""}`} />
                                      ) : (
                                        <span className="size-3 shrink-0" />
                                      )}
                                      <span className="font-semibold text-foreground truncate">{subGroup}</span>
                                    </div>

                                    <div className="w-20 text-right">
                                      {renderChangeBadge(subData.strengthChange, hasSubActivity && subData.baselineVolume > 0)}
                                    </div>
                                  </div>

                                  {isSubExpanded && hasExercises && (
                                    <div className="ml-4 mr-1 mb-2 px-2.5 py-2 rounded-md bg-surface-2/60 border border-border/30 space-y-1">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-1">Top Exercises (4-Week Trend)</p>
                                      {subData.topExercises.map((exercise, idx) => renderExerciseTrend(exercise, idx))}
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

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed pt-1">
              Strength reflects estimated 1RM from recent completed sessions compared against your rolling baseline.
            </p>

            <div className="pt-1">
              <a
                href="hevy://"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-2/40 hover:bg-surface-2 py-3 text-xs font-semibold text-foreground transition-colors"
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
