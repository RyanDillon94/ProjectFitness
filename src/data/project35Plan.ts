import type { PhaseDef, PlanState } from "@/lib/planTypes";

/**
 * Master blueprint for the Project 35 tenant. Everything the app used to
 * hardcode (dates, macro targets, phase/block structure, habit wording) lives
 * here and is seeded into the shared plan state on first boot.
 */
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
        blockHabits: [{ key: "steps", label: "12,500 Steps Hit", sublabel: "Daily Activity Base" }],
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
          {
            key: "finisher",
            label: "Conditioning Finisher Completed",
            sublabel: "2x Weekly Finisher",
          },
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
        bullets: [
          "Peak conditioning with full strength intact",
          "Photo checkpoint every four weeks",
        ],
        blockHabits: [
          {
            key: "peaking",
            label: "Peak Performance Session Hit",
            sublabel: "Strength + Conditioning",
          },
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

export const PROJECT_35_PLAN: PlanState = {
  projectName: "Project 35",
  tagline: "Built over years. Ready for everything. Arrive at 35 in undeniable shape.",
  headline: "The Undeniable Standard",
  footerQuote: "Only cunts drink on weekdays... Don't be a cunt.",
  roadmapTitle: "3-Year Macro Roadmap",
  longTermTarget: "Target: November 2029 \u2014 Age 35",
  programStart: "2026-09-07",
  startingWeight: 224.0,
  goalWeight: 190.0,
  targetDate: "2029-11-01T00:00:00Z",
  dailyTargets: {
    caloriesMin: 2000,
    caloriesMax: 2400,
    protein: 180,
    steps: 12500,
    routine: "6:00 AM Weekday Iron \u2192 7:00 AM Dog Walk",
  },
  habitLabels: {
    workoutWeekday: { label: "Workout Completed", sublabel: "Iron Logged" },
    workoutWeekend: { label: "Dog Walk Completed", sublabel: "Weekend Routine" },
    timeWeekday: { label: "Hit at 6:00 AM", sublabel: "The Early Standard" },
    timeWeekend: { label: "Morning Routine As Planned", sublabel: "Weekend Standard" },
    caloriesSublabel: "Deficit Discipline",
  },
  habits: [],
  phases: PROJECT_35_PHASES,
};
