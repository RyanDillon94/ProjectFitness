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

export type HabitLabel = {
  label: string;
  sublabel: string;
};

/** Labels for the habits the engine generates when no explicit habit list is stored. */
export type HabitLabelSet = {
  workoutWeekday: HabitLabel;
  workoutWeekend: HabitLabel;
  timeWeekday: HabitLabel;
  timeWeekend: HabitLabel;
  caloriesSublabel: string;
};

/**
 * The single reactive plan the whole app runs on, regardless of tenant.
 * Project 35 seeds it from the master blueprint; Ascension generates it
 * through onboarding. Both then share the same storage key and engine.
 */
export type PlanState = {
  projectName: string;
  tagline: string;
  headline: string;
  footerQuote: string;
  roadmapTitle: string;
  /** Optional override for the long-term target label; derived from targetDate when absent. */
  longTermTarget?: string;
  /** Day the programme starts; drives photo weeks and programme week numbers. */
  programStart: string;
  startingWeight: number;
  goalWeight: number;
  targetDate: string;
  dailyTargets: DailyTargetSet;
  habitLabels: HabitLabelSet;
  habits: HabitDefinition[];
  phases: PhaseDef[];
  /** Legacy alias kept for profiles written by older Ascension builds. */
  targets?: DailyTargetSet;
};

/** Historic name for the stored plan; kept so existing imports keep compiling. */
export type AscensionUserProfile = Partial<PlanState>;
