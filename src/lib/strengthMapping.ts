export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Legs";

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Legs",
];

export type LegMuscleGroup =
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Adductors";

export const LEG_MUSCLE_GROUPS: LegMuscleGroup[] = [
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Adductors",
];

export interface ExerciseTarget {
  primary: MuscleGroup;
  secondary?: MuscleGroup;
  legMuscle?: LegMuscleGroup;
}

export const EXERCISE_TARGET_MAP: Record<string, ExerciseTarget> = {
  // ============================================================
  // CHEST
  // ============================================================

  // Chest compounds
  "bench press": { primary: "Chest", secondary: "Triceps" },
  "barbell bench press": { primary: "Chest", secondary: "Triceps" },
  "dumbbell bench press": { primary: "Chest", secondary: "Triceps" },
  "incline barbell bench press": { primary: "Chest", secondary: "Triceps" },
  "incline dumbbell bench press": { primary: "Chest", secondary: "Triceps" },
  "decline barbell bench press": { primary: "Chest", secondary: "Triceps" },
  "decline dumbbell bench press": { primary: "Chest", secondary: "Triceps" },
  "chest press": { primary: "Chest", secondary: "Triceps" },
  "chest press (machine)": { primary: "Chest", secondary: "Triceps" },
  "incline chest press (machine)": {
    primary: "Chest",
    secondary: "Triceps",
  },
  "iso-lateral chest press (machine)": {
    primary: "Chest",
    secondary: "Triceps",
  },
  "vertical chest press": { primary: "Chest", secondary: "Triceps" },
  "weighted dip": { primary: "Chest", secondary: "Triceps" },
  "ring dips": { primary: "Chest", secondary: "Triceps" },
  "chest dip": { primary: "Chest", secondary: "Triceps" },
  "push up": { primary: "Chest", secondary: "Triceps" },
  "ring push up": { primary: "Chest", secondary: "Triceps" },

  // Chest isolations
  "chest fly": { primary: "Chest" },
  "cable fly": { primary: "Chest" },
  "chest fly (dumbbell)": { primary: "Chest" },
  "incline chest fly": { primary: "Chest" },
  "seated chest flys": { primary: "Chest" },
  "cable crossover": { primary: "Chest" },
  "low cable fly": { primary: "Chest" },
  "pec deck": { primary: "Chest" },

  // ============================================================
  // BACK
  // ============================================================

  // Back compounds
  "lat pulldown": { primary: "Back", secondary: "Biceps" },
  "lat pulldown (cable)": { primary: "Back", secondary: "Biceps" },
  "barbell row": { primary: "Back", secondary: "Biceps" },
  "dumbbell row": { primary: "Back", secondary: "Biceps" },
  "bent over row": { primary: "Back", secondary: "Biceps" },
  "bent over plate row": { primary: "Back", secondary: "Biceps" },
  "bent over row smith machine": {
    primary: "Back",
    secondary: "Biceps",
  },
  "seated cable row": { primary: "Back", secondary: "Biceps" },
  "seated row (machine)": { primary: "Back", secondary: "Biceps" },
  "seated cable row - bar wide grip": {
    primary: "Back",
    secondary: "Biceps",
  },
  "seated cable row - v grip (cable)": {
    primary: "Back",
    secondary: "Biceps",
  },
  "seated cable row - bar grip": {
    primary: "Back",
    secondary: "Biceps",
  },
  "standing cable row": { primary: "Back", secondary: "Biceps" },
  "upwards cable row": { primary: "Back", secondary: "Biceps" },
  "single arm cable row": { primary: "Back", secondary: "Biceps" },
  "seal row": { primary: "Back", secondary: "Biceps" },
  "t bar row": { primary: "Back", secondary: "Biceps" },
  "t bar wide grip": { primary: "Back", secondary: "Biceps" },
  "chest supported t bar row": {
    primary: "Back",
    secondary: "Biceps",
  },
  "chest supported barbell row": {
    primary: "Back",
    secondary: "Biceps",
  },
  "chest supported incline row": {
    primary: "Back",
    secondary: "Biceps",
  },
  "gorilla row": { primary: "Back", secondary: "Biceps" },
  "iso-lateral low row": { primary: "Back", secondary: "Biceps" },
  "iso-lateral row": { primary: "Back", secondary: "Biceps" },
  "landmine row": { primary: "Back", secondary: "Biceps" },
  "meadows rows": { primary: "Back", secondary: "Biceps" },
  "pendlay row": { primary: "Back", secondary: "Biceps" },
  "renegade row": { primary: "Back", secondary: "Biceps" },
  "inverted row": { primary: "Back", secondary: "Biceps" },
  "low row": { primary: "Back", secondary: "Biceps" },
  "pull-up": { primary: "Back", secondary: "Biceps" },
  "chin-up": { primary: "Back", secondary: "Biceps" },
  "scapular pull ups": { primary: "Back", secondary: "Biceps" },

  // Back isolations / posterior chain
  "straight arm lat pulldown": { primary: "Back" },
  "cable straight arm pulldown": { primary: "Back" },
  "dead hang": { primary: "Back" },
  "trap bar deadlift": { primary: "Back" },
  "deadlift": { primary: "Back" },
  "rack pull": { primary: "Back" },
  "back extension": { primary: "Back" },
  "back extension (machine)": { primary: "Back" },
  "back extension (hyperextension)": { primary: "Back" },
  "back extension (weighted hyperextension)": {
    primary: "Back",
  },
  "superman": { primary: "Back" },
  "reverse fly double cable": { primary: "Back" },

  // ============================================================
  // SHOULDERS
  // ============================================================

  // Shoulder presses
  "shoulder press": { primary: "Shoulders", secondary: "Triceps" },
  "dumbbell shoulder press": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "barbell overhead press": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "overhead press": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "seated overhead press": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "seated shoulder press": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "shoulder press (machine)": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "shoulder press (machine plates)": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "v bar shoulder press": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "seated shoulder press inside": {
    primary: "Shoulders",
    secondary: "Triceps",
  },
  "arnold press": {
    primary: "Shoulders",
    secondary: "Triceps",
  },

  // Shoulder isolations
  "lateral raise": { primary: "Shoulders" },
  "lateral raise (machine)": { primary: "Shoulders" },
  "lateral raise (dumbbell)": { primary: "Shoulders" },
  "lateral raise (cable)": { primary: "Shoulders" },
  "lateral raise (band)": { primary: "Shoulders" },
  "single arm lateral raise": { primary: "Shoulders" },
  "front raise": { primary: "Shoulders" },
  "plate front raise": { primary: "Shoulders" },
  "face pull": { primary: "Shoulders" },
  "rear delt fly": { primary: "Shoulders" },
  "reverse fly": { primary: "Shoulders" },
  "rear delt": { primary: "Shoulders" },
  "chest supported reverse fly": { primary: "Shoulders" },
  "upright row": { primary: "Shoulders" },
  "standing y raise": { primary: "Shoulders" },
  "shrug": { primary: "Shoulders" },

  // ============================================================
  // BICEPS
  // ============================================================

  "bicep curl": { primary: "Biceps" },
  "barbell curl": { primary: "Biceps" },
  "dumbbell curl": { primary: "Biceps" },
  "bicep curl (barbell)": { primary: "Biceps" },
  "bicep curl (dumbbell)": { primary: "Biceps" },
  "bicep curl (machine)": { primary: "Biceps" },
  "bicep curl (suspension)": { primary: "Biceps" },
  "ez bicep curl outside": { primary: "Biceps" },
  "ez bicep curl inside": { primary: "Biceps" },
  "ez bar biceps curl": { primary: "Biceps" },
  "ez bar bicep curl": { primary: "Biceps" },
  "ez bar curl": { primary: "Biceps" },
  "hammer curl": { primary: "Biceps" },
  "hammer curl (dumbbell)": { primary: "Biceps" },
  "hammer curl (band)": { primary: "Biceps" },
  "hammer curl (cable)": { primary: "Biceps" },
  "hammer spider curls": { primary: "Biceps" },
  "preacher curl": { primary: "Biceps" },
  "preacher curl (dumbbell)": { primary: "Biceps" },
  "preacher curl (machine)": { primary: "Biceps" },
  "preacher curl (barbell)": { primary: "Biceps" },
  "preacher bicep curl outside": { primary: "Biceps" },
  "concentration curl": { primary: "Biceps" },
  "spider curl": { primary: "Biceps" },
  "spider curl (barbell)": { primary: "Biceps" },
  "spider curl (dumbbell)": { primary: "Biceps" },
  "spider curl inside": { primary: "Biceps" },
  "waiter curl": { primary: "Biceps" },
  "zottman curl": { primary: "Biceps" },
  "kettlebell curl": { primary: "Biceps" },
  "overhead curl": { primary: "Biceps" },
  "pinwheel curl": { primary: "Biceps" },
  "plate curl": { primary: "Biceps" },
  "reverse curl": { primary: "Biceps" },
  "reverse curl (barbell)": { primary: "Biceps" },
  "reverse curl (cable)": { primary: "Biceps" },
  "reverse curl (dumbbell)": { primary: "Biceps" },
  "reverse grip concentration curl": { primary: "Biceps" },
  "rope cable curl": { primary: "Biceps" },
  "seated incline curl": { primary: "Biceps" },
  "seated incline hammer curl": { primary: "Biceps" },
  "standing bicep cable curl": { primary: "Biceps" },
  "21s bicep curl": { primary: "Biceps" },
  "behind the back curl": { primary: "Biceps" },
  "cross body hammer curl": { primary: "Biceps" },
  "drag curl": { primary: "Biceps" },
  "single arm curl": { primary: "Biceps" },

  // ============================================================
  // TRICEPS
  // ============================================================

  "tricep pushdown": { primary: "Triceps" },
  "triceps pushdown": { primary: "Triceps" },
  "triceps rope pushdown": { primary: "Triceps" },
  "v bar pushdown": { primary: "Triceps" },
  "skull crusher": { primary: "Triceps" },
  "skullcrusher": { primary: "Triceps" },
  "overhead triceps extension": { primary: "Triceps" },
  "close grip bench press": {
    primary: "Triceps",
    secondary: "Chest",
  },
  "tricep dip": {
    primary: "Triceps",
    secondary: "Chest",
  },
  "tricep extension": { primary: "Triceps" },
  "single arm tricep pushdown": { primary: "Triceps" },
  "triceps kickback": { primary: "Triceps" },

  // ============================================================
  // LEGS
  // ============================================================

  // Quads
  "squat": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "barbell squat": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "front squat": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "hack squat": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "hack squat (machine)": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "leg press": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "leg extension": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "leg extension (machine)": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "bulgarian split squat": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "split squat": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "lunges": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "lunge": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "walking lunge": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "reverse lunge": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "step up": {
    primary: "Legs",
    legMuscle: "Quads",
  },
  "step-up": {
    primary: "Legs",
    legMuscle: "Quads",
  },

  // Hamstrings
  "leg curl": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "lying leg curl": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "seated leg curl": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "standing leg curl": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "romanian deadlift": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "rdl": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "stiff leg deadlift": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "stiff-legged deadlift": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },
  "good morning": {
    primary: "Legs",
    legMuscle: "Hamstrings",
  },

  // Glutes
  "hip thrust": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "hip thrust (machine)": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "glute bridge": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "glute bridge (machine)": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "cable kickback": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "glute kickback": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "glute kickback (machine)": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "hip abduction": {
    primary: "Legs",
    legMuscle: "Glutes",
  },
  "hip abduction (machine)": {
    primary: "Legs",
    legMuscle: "Glutes",
  },

  // Calves
  "calf raise": {
    primary: "Legs",
    legMuscle: "Calves",
  },
  "standing calf raise": {
    primary: "Legs",
    legMuscle: "Calves",
  },
  "seated calf raise": {
    primary: "Legs",
    legMuscle: "Calves",
  },
  "calf raise (machine)": {
    primary: "Legs",
    legMuscle: "Calves",
  },
  "calf press": {
    primary: "Legs",
    legMuscle: "Calves",
  },
  "donkey calf raise": {
    primary: "Legs",
    legMuscle: "Calves",
  },

  // Adductors
  "hip adduction": {
    primary: "Legs",
    legMuscle: "Adductors",
  },
  "hip adduction (machine)": {
    primary: "Legs",
    legMuscle: "Adductors",
  },
  "adductor machine": {
    primary: "Legs",
    legMuscle: "Adductors",
  },
};

export function getExerciseTargets(
  exerciseName: string
): ExerciseTarget | null {
  const normalized = exerciseName.trim().toLowerCase();

  if (EXERCISE_TARGET_MAP[normalized]) {
    return EXERCISE_TARGET_MAP[normalized];
  }

  for (const [key, target] of Object.entries(EXERCISE_TARGET_MAP)) {
    if (normalized.includes(key)) {
      return target;
    }
  }

  // ------------------------------------------------------------
  // General fallbacks
  // ------------------------------------------------------------

  if (
    normalized.includes("calf") ||
    normalized.includes("calves")
  ) {
    return {
      primary: "Legs",
      legMuscle: "Calves",
    };
  }

  if (
    normalized.includes("adductor") ||
    normalized.includes("adduction")
  ) {
    return {
      primary: "Legs",
      legMuscle: "Adductors",
    };
  }

  if (
    normalized.includes("abductor") ||
    normalized.includes("abduction") ||
    normalized.includes("glute")
  ) {
    return {
      primary: "Legs",
      legMuscle: "Glutes",
    };
  }

  if (
    normalized.includes("leg curl") ||
    normalized.includes("hamstring") ||
    normalized.includes("romanian deadlift") ||
    normalized.includes("rdl") ||
    normalized.includes("stiff leg") ||
    normalized.includes("stiff-leg") ||
    normalized.includes("good morning")
  ) {
    return {
      primary: "Legs",
      legMuscle: "Hamstrings",
    };
  }

  if (
    normalized.includes("squat") ||
    normalized.includes("leg press") ||
    normalized.includes("leg extension") ||
    normalized.includes("split squat") ||
    normalized.includes("lunge") ||
    normalized.includes("step up") ||
    normalized.includes("step-up") ||
    normalized.includes("hack squat")
  ) {
    return {
      primary: "Legs",
      legMuscle: "Quads",
    };
  }

  if (
    normalized.includes("curl") ||
    normalized.includes("21s")
  ) {
    return {
      primary: "Biceps",
    };
  }

  if (
    normalized.includes("tricep") ||
    normalized.includes("pushdown") ||
    normalized.includes("skull")
  ) {
    return {
      primary: "Triceps",
    };
  }

  if (
    normalized.includes("press") &&
    (normalized.includes("bench") ||
      normalized.includes("chest"))
  ) {
    return {
      primary: "Chest",
      secondary: "Triceps",
    };
  }

  if (
    normalized.includes("overhead press") ||
    normalized.includes("shoulder press")
  ) {
    return {
      primary: "Shoulders",
      secondary: "Triceps",
    };
  }

  if (
    normalized.includes("row") ||
    normalized.includes("pulldown") ||
    normalized.includes("pull-up") ||
    normalized.includes("chin-up")
  ) {
    return {
      primary: "Back",
      secondary: "Biceps",
    };
  }

  if (
    normalized.includes("deadlift") ||
    normalized.includes("hyperextension")
  ) {
    return {
      primary: "Back",
    };
  }

  if (
    normalized.includes("leg") ||
    normalized.includes("squat") ||
    normalized.includes("calf")
  ) {
    return {
      primary: "Legs",
    };
  }

  return null;
}

export function getMuscleGroupForExercise(
  exerciseName: string
): MuscleGroup | null {
  const target = getExerciseTargets(exerciseName);
  return target ? target.primary : null;
}

export function getLegMuscleGroupForExercise(
  exerciseName: string
): LegMuscleGroup | null {
  const target = getExerciseTargets(exerciseName);
  return target?.primary === "Legs"
    ? target.legMuscle ?? null
    : null;
}