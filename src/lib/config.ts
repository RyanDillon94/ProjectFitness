const TENANT = (import.meta.env["VITE_TENANT_ID"] as string | undefined) ?? "ascension";

export const IS_PROJECT_35 = TENANT === "project35";

export const APP_NAME = IS_PROJECT_35 ? "Project 35" : "Project Ascension";

export const APP_TAGLINE = IS_PROJECT_35
  ? "Built over years. Ready for everything. Arrive at 35 in undeniable shape."
  : "Forging unbreakable mental grit and a vascular, combat-ready physique.";

export const APP_HEADLINE = IS_PROJECT_35
  ? "Project 35: The Undeniable Standard"
  : "Project Ascension: Same Man, Higher Standards";

export { TENANT };
