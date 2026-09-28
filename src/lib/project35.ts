import { getCurrentDate, getDeloadOffset } from "../utils/dateUtils";
import { IS_PROJECT_35 } from "./config";

export type HabitDefinition = {
  key: string;
  label: string;
  sublabel: string;
  isWeekdayOnly?: boolean;
};

export type BlockDef = {
  name: string;
  window: string;
  start: string;
  end: string;
  focus: string[];
  bullets: string[];
  blockHabits?: HabitDefinition[];
};

export type PhaseDef = {
  id: number;
  title: string;
  window: string;
  status: "active" | "upcoming" | "complete";
  summary: string;
  badges: string[];
  blocks: BlockDef[];
};

export type DailyTargetSet = {
  caloriesMin: number;
  caloriesMax: number;
  protein: number;
  steps: number;
  routine: string;
};

export type AscensionUserProfile = {
  projectName?: string;
  tagline?: string;
  footerQuote?: string;
  startingWeight?: number;
  goalWeight?: number;
  targetDate?: string;
  dailyTargets?: DailyTargetSet;
  /** Legacy alias kept for profiles written by older Ascension builds. */
  targets?: DailyTargetSet;
  habits?: HabitDefinition[];
  phases?: PhaseDef[];
};


const PROJECT_35_PHASES: PhaseDef[] = [
  {
    id: 1,
    title: "Setting the Standards & The Cut",
    window: "Sep 2026 – Mar 2027",
    status: "active",
    summary: "Establish the 6:00 AM habit and drop 30 lbs toward 190 lbs.",
    badges: ["Fat Loss", "Discipline"],
    blocks: [
      {
        name: "Block 1: Setting the Standards",
        window: "Weeks 1–12",
        start: "2026-09-07",
        end: "2026-11-29",
        focus: ["Habit", "Deficit"],
        bullets: [
          "Non-negotiable 6:00 AM lift, five days a week of showing up",
          "2,000–2,400 kcal, 180g+ protein, 12,500 steps daily",
          "End of week average weight is the only scale number that counts",
        ],
        blockHabits: [
          { key: "steps", label: "12,500 Steps Hit", sublabel: "Daily Activity Base" },
        ],
      },
      {
        name: "Block 2: The Cut",
        window: "Weeks 13–24",
        start: "2026-11-30",
        end: "2027-02-21",
        focus: ["Fat Loss", "Strength Retention"],
        bullets: [
          "Hold strength on the big four while the deficit continues",
          "Add one conditioning finisher twice per week",
          "Land at or under 190 lbs by the end of the block",
        ],
        blockHabits: [
          { key: "finisher", label: "Conditioning Finisher Completed", sublabel: "2x Weekly Finisher" },
        ],
      },
    ],
  },
  {
    id: 2,
    title: "The Foundation Build",
    window: "Feb 2027 – Aug 2027",
    status: "upcoming",
    summary: "Lean bulk with heavy compound hypertrophy.",
    badges: ["Hypertrophy", "Strength"],
    blocks: [
      {
        name: "Block 1: Reverse Diet",
        window: "Weeks 1–12",
        start: "2027-02-22",
        end: "2027-05-16",
        focus: ["Hypertrophy"],
        bullets: [
          "Calories back to maintenance, then a slow surplus",
          "Compound volume up: squat, bench, deadlift, press",
        ],
        blockHabits: [
          { key: "volume", label: "Compound Volume Target Met", sublabel: "Hypertrophy Standard" },
        ],
      },
      {
        name: "Block 2: Heavy Accumulation",
        window: "Weeks 13–24",
        start: "2027-05-17",
        end: "2027-08-08",
        focus: ["Strength"],
        bullets: [
          "Progressive overload on 5–8 rep top sets",
          "Bodyweight climbs no faster than 2 lbs per month",
        ],
        blockHabits: [
          { key: "top_sets", label: "5–8 Rep Top Set Logged", sublabel: "Progressive Overload" },
        ],
      },
    ],
  },
  {
    id: 3,
    title: "Athletic Performance",
    window: "Aug 2027 – Jan 2028",
    status: "upcoming",
    summary: "Work capacity and upper yoke development.",
    badges: ["Conditioning", "Hypertrophy"],
    blocks: [
      {
        name: "Block 1: Engine Work",
        window: "Weeks 1–12",
        start: "2027-08-09",
        end: "2027-10-31",
        focus: ["Conditioning"],
        bullets: ["Zone 2 base plus weekly intervals", "Carries and sled work every session"],
        blockHabits: [
          { key: "engine", label: "Zone 2 Engine / Intervals", sublabel: "Aerobic Capacity" },
        ],
      },
      {
        name: "Block 2: Yoke Build",
        window: "Weeks 13–24",
        start: "2027-11-01",
        end: "2028-01-23",
        focus: ["Hypertrophy"],
        bullets: ["Traps, delts, upper back triple frequency", "Overhead strength benchmarks"],
        blockHabits: [
          { key: "yoke", label: "Yoke / Overhead Work Complete", sublabel: "Traps & Delts" },
        ],
      },
    ],
  },
  {
    id: 4,
    title: "Hybrid Balance",
    window: "Jan 2028 – Jul 2028",
    status: "upcoming",
    summary: "Conditioning and functional strength held together.",
    badges: ["Conditioning", "Strength"],
    blocks: [
      {
        name: "Block 1: Strength + Engine",
        window: "Weeks 1–12",
        start: "2028-01-24",
        end: "2028-04-16",
        focus: ["Strength"],
        bullets: ["Two heavy days, two hybrid days", "Rucking and loaded carries weekly"],
        blockHabits: [
          { key: "hybrid", label: "Ruck / Loaded Carry Logged", sublabel: "Engine & Core" },
        ],
      },
      {
        name: "Block 2: Field Test",
        window: "Weeks 13–24",
        start: "2028-04-17",
        end: "2028-07-09",
        focus: ["Conditioning"],
        bullets: ["Benchmark events every four weeks", "Hold body fat in single-to-low teens"],
        blockHabits: [
          { key: "benchmark", label: "Conditioning Milestone Met", sublabel: "Field Benchmark" },
        ],
      },
    ],
  },
  {
    id: 5,
    title: "Peak Density",
    window: "Jul 2028 – Dec 2028",
    status: "upcoming",
    summary: "Maximum muscle maturity and leanness.",
    badges: ["Hypertrophy", "Strength"],
    blocks: [
      {
        name: "Block 1: Density Volume",
        window: "Weeks 1–12",
        start: "2028-07-10",
        end: "2028-10-01",
        focus: ["Hypertrophy"],
        bullets: ["Highest tolerable volume with clean technique", "Weak-point specialisation"],
        blockHabits: [
          { key: "density", label: "Density Lift Executed", sublabel: "Clean Form & Volume" },
        ],
      },
      {
        name: "Block 2: Final Lean",
        window: "Weeks 13–24",
        start: "2028-10-02",
        end: "2028-12-24",
        focus: ["Fat Loss"],
        bullets: ["Slow controlled cut, zero strength loss", "Full photo and lift audit"],
        blockHabits: [
          { key: "audit", label: "Strength Retained Top Sets", sublabel: "Zero Load Compromise" },
        ],
      },
    ],
  },
  {
    id: 6,
    title: "Project 35",
    window: "Dec 2028 – Nov 2029",
    status: "upcoming",
    summary: "Permanent identity, peak physique at 35.",
    badges: ["Strength", "Conditioning"],
    blocks: [
      {
        name: "Block 1: Sharpen",
        window: "Weeks 1–12",
        start: "2028-12-25",
        end: "2029-03-18",
        focus: ["Peaking"],
        bullets: ["Peak conditioning with full strength intact", "Photo checkpoint every four weeks"],
        blockHabits: [
          { key: "peaking", label: "Peak Performance Session Hit", sublabel: "Strength + Conditioning" },
        ],
      },
      {
        name: "Block 2: Arrive",
        window: "Weeks 13–24",
        start: "2029-03-19",
        end: "2029-11-01",
        focus: ["Identity"],
        bullets: ["Maintain the standard indefinitely", "Arrive at 35 in undeniable shape"],
        blockHabits: [
          { key: "identity", label: "The Undeniable Standard Held", sublabel: "Permanent Shape" },
        ],
      },
    ],
  },
];
const DEFAULT_12_MONTH_PHASES: PhaseDef[] = [
  {
    id: 1,
    title: "Phase 1: Setting Standards & Base Engine",
    window: "Sep 2026 – Nov 2026",
    status: "active",
    summary: "Lock in daily training consistency, dial in nutrition, and build aerobic capacity.",
    badges: ["Base Conditioning", "Discipline"],
    blocks: [
      {
        name: "Block 1: Baseline Architecture",
        window: "Weeks 1–6",
        start: "2026-09-07",
        end: "2026-10-18",
        focus: ["Routine", "Base Engine"],
        bullets: [
          "Establish uncompromised workout consistency",
          "Lock in daily hydration, steps, and protein threshold",
          "Weekly rolling average weight tracking",
        ],
        blockHabits: [
          { key: "steps", label: "Daily Steps Hit", sublabel: "Baseline Movement" },
        ],
      },
      {
        name: "Block 2: Work Capacity",
        window: "Weeks 7–12",
        start: "2026-10-19",
        end: "2026-11-29",
        focus: ["Volume", "Conditioning"],
        bullets: [
          "Introduce post-session conditioning circuits",
          "Reinforce rotational power and core stability",
          "Maintain weekly deficit or lean bulk targets",
        ],
        blockHabits: [
          { key: "conditioning", label: "Conditioning Circuit Hit", sublabel: "Capacity Builder" },
        ],
      },
    ],
  },
  {
    id: 2,
    title: "Phase 2: Hypertrophy & Kinetic Power",
    window: "Nov 2026 – Feb 2027",
    status: "upcoming",
    summary: "Heavy compound volume, kinetic chain endurance, and lean mass accumulation.",
    badges: ["Hypertrophy", "Strength"],
    blocks: [
      {
        name: "Block 1: Heavy Compounds",
        window: "Weeks 13–18",
        start: "2026-11-30",
        end: "2027-01-10",
        focus: ["Strength"],
        bullets: ["Progressive overload on prime compound movements", "Solidify joint resilience"],
      },
      {
        name: "Block 2: Density Build",
        window: "Weeks 19–24",
        start: "2027-01-11",
        end: "2027-02-21",
        focus: ["Hypertrophy"],
        bullets: ["Volume progression with clean RPE regulation", "Strict recovery compliance"],
      },
    ],
  },
  {
    id: 3,
    title: "Phase 3: Athletic Performance & Combat Prep",
    window: "Feb 2027 – May 2027",
    status: "upcoming",
    summary: "Explosive power output, sports-specific conditioning, and rate of force development.",
    badges: ["Power", "Performance"],
    blocks: [
      {
        name: "Block 1: Speed-Strength",
        window: "Weeks 25–30",
        start: "2027-02-22",
        end: "2027-04-04",
        focus: ["Speed", "Power"],
        bullets: ["Dynamic effort work paired with high-output anaerobic intervals"],
      },
      {
        name: "Block 2: Tournament Engine",
        window: "Weeks 31–36",
        start: "2027-04-05",
        end: "2027-05-16",
        focus: ["Peaking", "Grip & Core"],
        bullets: ["Sport-specific conditioning peaks and tactical taper"],
      },
    ],
  },
  {
    id: 4,
    title: "Phase 4: Peak Ascension",
    window: "May 2027 – Aug 2027",
    status: "upcoming",
    summary: "Peak aesthetic leanness, full functional power, and permanent standard execution.",
    badges: ["Peak Shape", "Mastery"],
    blocks: [
      {
        name: "Block 1: Final Sharpen",
        window: "Weeks 37–42",
        start: "2027-05-17",
        end: "2027-06-27",
        focus: ["Body Composition"],
        bullets: ["Dial down to target bodyweight while preserving top-end power"],
      },
      {
        name: "Block 2: The Standard",
        window: "Weeks 43–48",
        start: "2027-06-28",
        end: "2027-08-08",
        focus: ["Identity"],
        bullets: ["Lock in peak form indefinitely. Project Ascension complete."],
      },
    ],
  },
];
const DEFAULT_DAILY_TARGETS: DailyTargetSet = {
  caloriesMin: 2200,
  caloriesMax: 2500,
  protein: 180,
  steps: 10000,
  routine: "Morning Routine → Athletic Training Session",
};

const DEFAULT_PROFILE: AscensionUserProfile = {
  projectName: "Project Ascension",
  tagline: "Same Man, Higher Standards",
  footerQuote: "Don't negotiate with weakness.",
  startingWeight: 210,
  goalWeight: 185,
  targetDate: "2027-09-01T00:00:00Z",
  dailyTargets: DEFAULT_DAILY_TARGETS,
  targets: DEFAULT_DAILY_TARGETS,
  habits: [],
  phases: DEFAULT_12_MONTH_PHASES,
};

export function getAscensionProfile(): AscensionUserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem("ascension_user_profile");
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      targets: parsed.dailyTargets || parsed.targets || DEFAULT_PROFILE.dailyTargets,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}


const PROJECT_35_TARGETS = {
  caloriesMin: 2000,
  caloriesMax: 2400,
  protein: 180,
  steps: 12500,
  routine: "6:00 AM Weekday Iron → 7:00 AM Dog Walk",
};

const PROJECT_35_TARGET_DATE = "2029-11-01T00:00:00Z";
const PROJECT_35_GOAL_WEIGHT = 190.0;
const PROJECT_35_START_WEIGHT = 224.0;

export const DAILY_TARGETS = {
  get caloriesMin(): number {
    if (IS_PROJECT_35) return PROJECT_35_TARGETS.caloriesMin;
    return getAscensionProfile().dailyTargets?.caloriesMin ?? 2200;
  },
  get caloriesMax(): number {
    if (IS_PROJECT_35) return PROJECT_35_TARGETS.caloriesMax;
    return getAscensionProfile().dailyTargets?.caloriesMax ?? 2500;
  },
  get protein(): number {
    if (IS_PROJECT_35) return PROJECT_35_TARGETS.protein;
    return getAscensionProfile().dailyTargets?.protein ?? 180;
  },
  get steps(): number {
    if (IS_PROJECT_35) return PROJECT_35_TARGETS.steps;
    return getAscensionProfile().dailyTargets?.steps ?? 10000;
  },
  get routine(): string {
    if (IS_PROJECT_35) return PROJECT_35_TARGETS.routine;
    return (
      getAscensionProfile().dailyTargets?.routine ??
      "Morning Routine → Athletic Training Session"
    );
  },
};

export function getGoalWeight(): number {
  if (IS_PROJECT_35) return PROJECT_35_GOAL_WEIGHT;
  return getAscensionProfile().goalWeight ?? 185.0;
}

export function getStartWeight(): number {
  if (IS_PROJECT_35) return PROJECT_35_START_WEIGHT;
  return getAscensionProfile().startingWeight ?? 210.0;
}

export function getTargetDate(): Date {
  if (IS_PROJECT_35) return new Date(PROJECT_35_TARGET_DATE);
  return new Date(getAscensionProfile().targetDate ?? "2027-09-01T00:00:00Z");
}

export function getPhases(): PhaseDef[] {
  if (IS_PROJECT_35) return PROJECT_35_PHASES;
  const phases = getAscensionProfile().phases;
  return phases && phases.length > 0 ? phases : DEFAULT_12_MONTH_PHASES;
}

export function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

export function getLongTermTarget(): string {
  if (IS_PROJECT_35) return "Target: November 2029 — Age 35";
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

  if (!IS_PROJECT_35) {
    const profile = getAscensionProfile();
    if (profile.habits && profile.habits.length > 0) {
      return profile.habits.map((h) => ({
        key: h.key,
        label: h.label,
        sublabel: h.sublabel || "Ascension Standard",
        ...(h.isWeekdayOnly === undefined ? {} : { isWeekdayOnly: h.isWeekdayOnly }),
      }));
    }
  }

  const workoutHabit: HabitDefinition = isWeekend
    ? {
        key: "weekend_workout_complete",
        label: IS_PROJECT_35 ? "Dog Walk Completed" : "Active Recovery / Walk",
        sublabel: IS_PROJECT_35 ? "Weekend Routine" : "Weekend Standard",
      }
    : {
        key: "workout_complete",
        label: "Workout Completed",
        sublabel: IS_PROJECT_35 ? "Iron Logged" : "Session Logged",
      };

  const timeHabit: HabitDefinition = isWeekend
    ? { key: "weekend_early_start", label: "Morning Routine As Planned", sublabel: "Weekend Standard" }
    : {
        key: "early_morning",
        label: IS_PROJECT_35 ? "Hit at 6:00 AM" : "Morning Standard Held",
        sublabel: "The Early Standard",
        isWeekdayOnly: true,
      };

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
    sublabel: IS_PROJECT_35 ? "Deficit Discipline" : "Macro Discipline",
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
