import type { PhaseDef, PlanState } from "@/lib/planTypes";

/**
 * Fallback blueprint used by the Ascension tenant before onboarding has
 * generated a tailored plan. Onboarding overwrites this wholesale.
 */
const ASCENSION_DEFAULT_PHASES: PhaseDef[] = [
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
        blockHabits: [{ key: "steps", label: "Daily Steps Hit", sublabel: "Baseline Movement" }],
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

export const ASCENSION_DEFAULT_PLAN: PlanState = {
  projectName: "Project Ascension",
  tagline: "Same Man, Higher Standards",
  headline: "Same Man, Higher Standards",
  footerQuote: "Don't negotiate with weakness.",
  roadmapTitle: "Macro Roadmap",
  programStart: "2026-09-07",
  startingWeight: 210,
  goalWeight: 185,
  targetDate: "2027-09-01T00:00:00Z",
  dailyTargets: {
    caloriesMin: 2200,
    caloriesMax: 2500,
    protein: 180,
    steps: 10000,
    routine: "Morning Routine \u2192 Athletic Training Session",
  },
  habitLabels: {
    workoutWeekday: { label: "Workout Completed", sublabel: "Session Logged" },
    workoutWeekend: { label: "Active Recovery / Walk", sublabel: "Weekend Standard" },
    timeWeekday: { label: "Morning Standard Held", sublabel: "The Early Standard" },
    timeWeekend: { label: "Morning Routine As Planned", sublabel: "Weekend Standard" },
    caloriesSublabel: "Macro Discipline",
  },
  habits: [],
  phases: ASCENSION_DEFAULT_PHASES,
};
