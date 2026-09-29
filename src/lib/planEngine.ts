import { IS_PROJECT_35 } from "./config";
import { PROJECT_35_PLAN } from "@/data/project35Plan";
import { ASCENSION_DEFAULT_PLAN } from "@/data/ascensionDefaultPlan";
import type { PlanState } from "./planTypes";

export const PLAN_STORAGE_KEY = "ascension_user_profile";
export const SETUP_COMPLETE_KEY = "p35_setup_complete";
export const PLAN_UPDATED_EVENT = "p35-plan-updated";

/** Blueprint the tenant falls back to before anything is stored. */
export function getPlanBlueprint(): PlanState {
  return IS_PROJECT_35 ? PROJECT_35_PLAN : ASCENSION_DEFAULT_PLAN;
}

let cachedPlan: PlanState | null = null;

function firstBlockStart(plan: PlanState): string | undefined {
  return plan.phases?.[0]?.blocks?.[0]?.start;
}

function mergeWithBlueprint(stored: Partial<PlanState>): PlanState {
  const blueprint = getPlanBlueprint();
  const phases = stored.phases && stored.phases.length > 0 ? stored.phases : blueprint.phases;
  const dailyTargets = {
    ...blueprint.dailyTargets,
    ...(stored.dailyTargets ?? stored.targets ?? {}),
  };

  const merged: PlanState = {
    ...blueprint,
    ...stored,
    phases,
    dailyTargets,
    targets: dailyTargets,
    habitLabels: { ...blueprint.habitLabels, ...(stored.habitLabels ?? {}) },
    habits: stored.habits ?? blueprint.habits,
  };

  merged.programStart = stored.programStart ?? firstBlockStart(merged) ?? blueprint.programStart;

  return merged;
}

/** The live plan every card, habit and prompt reads from. */
export function getPlan(): PlanState {
  if (cachedPlan) return cachedPlan;
  if (typeof window === "undefined") return getPlanBlueprint();

  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return getPlanBlueprint();
    cachedPlan = mergeWithBlueprint(JSON.parse(raw) as Partial<PlanState>);
    return cachedPlan;
  } catch {
    return getPlanBlueprint();
  }
}

export function refreshPlan(): PlanState {
  cachedPlan = null;
  return getPlan();
}

/** Persist a full plan and let the UI know it changed. */
export function savePlan(next: PlanState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(next));
  cachedPlan = null;
  window.dispatchEvent(new Event(PLAN_UPDATED_EVENT));
}

/** Merge a partial update (used by the recalibration coach) into the active plan. */
export function updatePlan(patch: Partial<PlanState>): PlanState {
  const next = mergeWithBlueprint({ ...getPlan(), ...patch });
  savePlan(next);
  return next;
}

/**
 * Project 35 has a fixed blueprint, so its plan is seeded straight into the
 * shared state on first boot and onboarding is skipped. Ascension is left
 * untouched so the onboarding wizard can generate a tailored plan.
 */
export function seedPlanIfMissing(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(PLAN_STORAGE_KEY)) {
    if (IS_PROJECT_35) localStorage.setItem(SETUP_COMPLETE_KEY, "true");
    return false;
  }
  if (!IS_PROJECT_35) return false;

  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(PROJECT_35_PLAN));
  localStorage.setItem(SETUP_COMPLETE_KEY, "true");
  cachedPlan = null;
  return true;
}

export function needsOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SETUP_COMPLETE_KEY) !== "true";
}
