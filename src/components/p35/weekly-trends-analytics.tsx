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
import React from 'react';

export function WeeklyTrendsAnalytics() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedLegSubGroup, setExpandedLegSubGroup] = useState<LegSubGroup | null>(null);

  /*
   * ============================================================
   * PROTOTYPE DATA & HELPERS
   * ============================================================
   */
  const prototypeMuscleData = useMemo(() => [
    { name: 'Chest', currentSets: 48, targetSets: 50, status: 'stable' },
    { name: 'Back', currentSets: 32, targetSets: 45, status: 'dropping' },
    { name: 'Shoulders', currentSets: 55, targetSets: 40, status: 'spiking' },
    { name: 'Biceps', currentSets: 28, targetSets: 30, status: 'stable' },
    { name: 'Triceps', currentSets: 22, targetSets: 32, status: 'dropping' },
    { name: 'Legs', currentSets: 40, targetSets: 40, status: 'stable' },
  ], []);

  const getPrototypeColor = (status: string) => {
    if (status === 'stable') return 'bg-emerald-500';
    if (status === 'dropping') return 'bg-rose-600';
    if (status === 'spiking') return 'bg-amber-500';
    return 'bg-slate-500';
  };

  const getPrototypeTextColor = (status: string) => {
    if (status === 'stable') return 'text-emerald-500';
    if (status === 'dropping') return 'text-rose-600';
    if (status === 'spiking') return 'text-amber-500';
    return 'text-slate-500';
  };

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

      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed) return [];

      const extracted: WorkoutSet[] = [];
      const workouts = Array.isArray(parsed) ? parsed : [parsed];

      workouts.forEach((w: any) => {
        if (!w) return;
        const date =
          w.date ||
          w.startTime?.slice(0, 10) ||
          w.start_time?.slice(0, 10) ||
          new Date().toISOString().slice(0, 10);

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

  /*
   * ============================================================
   * TRAINING PROGRESS
   * ============================================================
   */
  const progress = useMemo(() => calculateTrainingProgress(sets), [sets]);

  /*
   * ============================================================
   * ADHERENCE TREND
   * ============================================================
   */
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
      weeks.push({
        weekLabel,
        score: Math.min(100, Math.max(0, finalScore)),
      });
    }
    return weeks;
  }, [isOpen]);

  const averageScore = useMemo(() => {
    const validWeeks = trendData.filter((w) => w.score > 0);
    if (validWeeks.length === 0) return 0;
    return Math.round(validWeeks.reduce((acc, curr) => acc + curr.score, 0) / validWeeks.length);
  }, [trendData]);

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

        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              Performance Analytics
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* ADHERENCE SUMMARY */}
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

            {/* WEEKLY ADHERENCE */}
            <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rolling 4 Week Adherence
              </p>
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

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              Adherence is calculated dynamically based on weekday rules and weekly execution protocol targets.
            </p>

            {/* ==================================================
                TRAINING MOMENTUM (NEW 4-WEEK PROTOTYPE UI)
                ================================================== */}
            <div className="mt-6 pt-5 border-t border-border space-y-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Training Momentum
              </h3>

              {/* Top Level KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-surface-2/60 p-3.5 text-center space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Strength
                  </p>
                  <div className="font-display text-xl font-bold pt-1 text-emerald-500">
                    +0.6% ↗
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/60 p-3.5 text-center space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Sets (4W)
                  </p>
                  <div className="font-display text-xl font-bold pt-1 flex items-baseline justify-center gap-1">
                    <span className="text-foreground">225</span>
                    <span className="text-muted-foreground text-sm">/ 237</span>
                  </div>
                </div>
              </div>

              {/* 12-Week Sparkline (Simulated) */}
              <div className="rounded-t-lg border-t border-x border-border bg-surface-2/40 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-muted-foreground font-semibold tracking-wider">12-WEEK SET LOAD</span>
                </div>
                <svg className="w-full h-12" viewBox="0 0 100 30" preserveAspectRatio="none">
                  <path d="M0,25 L10,20 L20,28 L30,15 L40,18 L50,10 L60,12 L70,5 L80,15 L90,20 L100,18" fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Muscle Group Breakdown */}
              <div className="rounded-b-lg border border-border bg-surface-2/40 p-4">
                <div className="flex justify-between text-[10px] text-muted-foreground font-semibold tracking-wider mb-4 border-b border-border/60 pb-2">
                  <span>MUSCLE GROUPS</span>
                  <span>SETS vs TARGET</span>
                </div>

                <div className="space-y-5">
                  {prototypeMuscleData.map((muscle) => {
                    const fillPercentage = Math.min((muscle.currentSets / muscle.targetSets) * 100, 100);
                    
                    return (
                      <div key={muscle.name} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-foreground">{muscle.name}</span>
                          <span className={`text-xs font-bold ${getPrototypeTextColor(muscle.status)}`}>
                            {muscle.currentSets} <span className="text-muted-foreground font-normal">/ {muscle.targetSets}</span>
                          </span>
                        </div>
                        
                        {/* Bullet Chart */}
                        <div className="relative w-full h-2 bg-surface-2/80 rounded-full overflow-hidden border border-border/50">
                          {/* Fill Bar */}
                          <div 
                            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${getPrototypeColor(muscle.status)}`}
                            style={{ width: `${fillPercentage}%` }}
                          />
                          {/* Target Line (representing the previous 4-week baseline) */}
                          <div className="absolute top-0 bottom-0 left-[95%] w-0.5 bg-foreground z-10" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              Volume and strength reflect the last 28 days compared against your rolling 4-week baseline. Muscle group tracking uses completed working sets.
            </p>

            {/* HEVY LINK */}
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
