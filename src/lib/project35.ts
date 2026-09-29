import { getCurrentDate, getDeloadOffset } from "../utils/dateUtils";
import { getPlan, getPlanBlueprint } from "./planEngine";
import type { BlockDef, HabitDefinition, PhaseDef, PlanState } from "./planTypes";

export type {
  AscensionUserProfile,
  BlockDef,
  DailyTargetSet,
  HabitDefinition,
  HabitLabel,
  HabitLabelSet,
  PhaseDef,
  PlanState,
} from "./planTypes";

/** Historic accessor name. Both tenants now read the same engine state. */
export function getAscensionProfile(): PlanState {
  return getPlan();
}

export const DAILY_TARGETS = {
  get caloriesMin(): number {
    return getPlan().dailyTargets.caloriesMin;
  },
  get caloriesMax(): number {
    return getPlan().dailyTargets.caloriesMax;
  },
  get protein(): number {
    return getPlan().dailyTargets.protein;
  },
  get steps(): number {
    return getPlan().dailyTargets.steps;
  },
  get routine(): string {
    return getPlan().dailyTargets.routine;
  },
};

export function getGoalWeight(): number {
  return getPlan().goalWeight ?? getPlanBlueprint().goalWeight;
}

export function getStartWeight(): number {
  return getPlan().startingWeight ?? getPlanBlueprint().startingWeight;
}

export function getTargetDate(): Date {
  return new Date(getPlan().targetDate ?? getPlanBlueprint().targetDate);
}

export function getPhases(): PhaseDef[] {
  const phases = getPlan().phases;
  return phases && phases.length > 0 ? phases : getPlanBlueprint().phases;
}

/** First day of the programme, used for photo weeks and programme week numbers. */
export function getProgramStartDate(): Date {
  const plan = getPlan();
  const start = plan.programStart || plan.phases?.[0]?.blocks?.[0]?.start;
  return new Date(`${(start ?? getPlanBlueprint().programStart).slice(0, 10)}T00:00:00Z`);
}

/** 1-based week number of the programme for the supplied date. */
export function getProgramWeekNumber(now = getCurrentDate()): number {
  const diffDays = Math.ceil(
    Math.abs(now.getTime() - getProgramStartDate().getTime()) / 86_400_000,
  );
  return Math.max(1, Math.ceil(diffDays / 7));
}

export function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

export function getLongTermTarget(): string {
  const label = getPlan().longTermTarget;
  if (label) return label;
  const date = getTargetDate();
  return `Target: ${date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

const FALLBACK_BLOCK: BlockDef = {
  name: "Awaiting Setup",
  window: "—",
  start: "1970-01-01",
  end: "1970-01-01",
  focus: [],
  bullets: [],
};

const FALLBACK_PHASE: PhaseDef = {
  id: 1,
  title: "Awaiting Setup",
  window: "—",
  status: "upcoming",
  summary: "Complete setup to generate your plan.",
  badges: [],
  blocks: [FALLBACK_BLOCK],
};

export function getActiveBlockDetails(now = getCurrentDate()) {
  const phases = getPhases();
  const offsetDays = getDeloadOffset();
  const adjustedNowMs = now.getTime() - offsetDays * 86_400_000;

  let activePhase: PhaseDef = phases[0] ?? FALLBACK_PHASE;
  let activeBlock: BlockDef = activePhase.blocks[0] ?? FALLBACK_BLOCK;

  for (const phase of phases) {
    for (const block of phase.blocks) {
      const startMs = new Date(`${block.start}T00:00:00Z`).getTime();
      const endMs = new Date(`${block.end}T23:59:59Z`).getTime() + offsetDays * 86_400_000;

      if (adjustedNowMs >= startMs && adjustedNowMs <= endMs) {
        activePhase = phase;
        activeBlock = block;
        break;
      }
    }
  }

  const lastPhase: PhaseDef = phases[phases.length - 1] ?? activePhase;
  const lastBlock: BlockDef = lastPhase.blocks[lastPhase.blocks.length - 1] ?? activeBlock;
  if (adjustedNowMs > new Date(`${lastBlock.end}T23:59:59Z`).getTime() + offsetDays * 86_400_000) {
    activePhase = lastPhase;
    activeBlock = lastBlock;
  }

  return { activePhase, activeBlock };
}

export function getActiveHabits(now = getCurrentDate()): HabitDefinition[] {
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const { activeBlock } = getActiveBlockDetails(now);
  const plan = getPlan();
  const labels = plan.habitLabels ?? getPlanBlueprint().habitLabels;

  if (plan.habits && plan.habits.length > 0) {
    return plan.habits.map((h) => ({
      key: h.key,
      label: h.label,
      sublabel: h.sublabel || "Daily Standard",
      ...(h.isWeekdayOnly === undefined ? {} : { isWeekdayOnly: h.isWeekdayOnly }),
    }));
  }

  const workoutHabit: HabitDefinition = isWeekend
    ? { key: "weekend_workout_complete", ...labels.workoutWeekend }
    : { key: "workout_complete", ...labels.workoutWeekday };

  const timeHabit: HabitDefinition = isWeekend
    ? { key: "weekend_early_start", ...labels.timeWeekend }
    : { key: "early_morning", ...labels.timeWeekday, isWeekdayOnly: true };

  const stepsHabit: HabitDefinition = {
    key: "steps",
    label: `${DAILY_TARGETS.steps.toLocaleString()} Steps Hit`,
    sublabel: "Daily Activity Base",
  };

  const proteinHabit: HabitDefinition = {
    key: "protein",
    label: `Protein Target Hit (${DAILY_TARGETS.protein}g+)`,
    sublabel: "Muscle Retention & Recovery",
  };

  const caloriesHabit: HabitDefinition = {
    key: "calories",
    label: `Calorie Target Hit (${DAILY_TARGETS.caloriesMin.toLocaleString()}–${DAILY_TARGETS.caloriesMax.toLocaleString()} kcal)`,
    sublabel: labels.caloriesSublabel,
  };

  const blockSpecificHabits: HabitDefinition[] =
    activeBlock.blockHabits && activeBlock.blockHabits.length > 0
      ? activeBlock.blockHabits
      : [stepsHabit];

  return [workoutHabit, timeHabit, ...blockSpecificHabits, proteinHabit, caloriesHabit];
}

export function getActiveBlockCountdown(now = getCurrentDate()) {
  const { activePhase, activeBlock } = getActiveBlockDetails(now);
  const offsetDays = getDeloadOffset();

  const start = new Date(new Date(`${activeBlock.start}T00:00:00Z`).getTime());
  const end = new Date(new Date(`${activeBlock.end}T23:59:59Z`).getTime() + offsetDays * 86_400_000);

  const total = Math.max(1, daysBetween(start, end));
  const daysLeft = Math.max(0, daysBetween(now, end));
  const elapsed = Math.min(total, Math.max(0, total - daysLeft));

  const totalWeeks = Math.max(1, Math.round(total / 7));
  const currentWeek = Math.min(totalWeeks, Math.floor(elapsed / 7) + 1);
  const progress = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));

  const formatDate = (dateStr: string, addOffset = false) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    if (addOffset) {
      dateObj.setUTCDate(dateObj.getUTCDate() + offsetDays);
    }
    return dateObj.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  };

  return {
    phaseId: activePhase.id,
    phaseTitle: `Phase ${activePhase.id}`,
    blockName: activeBlock.name,
    window: activeBlock.window,
    goal: activeBlock.bullets[0] || activePhase.summary,
    dateRange: `${formatDate(activeBlock.start)} — ${formatDate(activeBlock.end, true)}`,
    currentWeek,
    totalWeeks,
    daysLeft,
    progress,
    longTermTarget: getLongTermTarget(),
  };
}

export function countdownTo(target: Date, now = getCurrentDate()) {
  const days = Math.max(0, daysBetween(now, target));
  return {
    days,
    weeks: Math.floor(days / 7),
    months: Math.max(0, Math.round(days / 30.44)),
  };
}

export function todayKey(now = getCurrentDate()) {
  if (typeof window !== "undefined") {
    const testDate = localStorage.getItem("p35_test_date");
    if (testDate) return testDate;
  }
  return now.toISOString().slice(0, 10);
}

export function lastSundayKey(now = getCurrentDate()) {
  const d = new Date(now);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
