export type HevySet = {
  weightKg: number | null;
  reps: number | null;
  type?: string | undefined;
  rpe?: number | null;
  notes?: string | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
};

export type HevyExercise = {
  title: string;
  notes?: string | null;
  sets: HevySet[];
};

export type HevyWorkout = {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  exercises: HevyExercise[];
};

type RawHevyWorkout = {
  id?: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  exercises?: Array<{
    title?: string;
    notes?: string | null;
    sets?: Array<{
      weight_kg?: number | null;
      reps?: number | null;
      type?: string;
      rpe?: number | null;
      notes?: string | null;
      distance_meters?: number | null;
      duration_seconds?: number | null;
    }>;
  }>;
};

/*
 * Localhost talks to Hevy directly. Deployed builds go through the
 * /hevy-api proxy (same as before).
 */
function hevyWorkoutsEndpoint(page: number): string {
  return window.location.hostname === "localhost"
    ? `https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`
    : `/hevy-api/workouts?page=${page}&pageSize=10`;
}

function mapRawWorkout(raw: RawHevyWorkout): HevyWorkout {
  return {
    id: raw.id ?? "unknown",
    title: raw.title ?? "Untitled workout",
    startTime: raw.start_time ?? null,
    endTime: raw.end_time ?? null,
    exercises: (raw.exercises ?? []).map((ex) => ({
      title: ex.title ?? "Exercise",
      notes: ex.notes ?? null,
      sets: (ex.sets ?? []).map((s) => ({
        weightKg: s.weight_kg ?? null,
        reps: s.reps ?? null,
        type: s.type,
        rpe: s.rpe ?? null,
        notes: s.notes ?? null,
        distanceMeters: s.distance_meters ?? null,
        durationSeconds: s.duration_seconds ?? null,
      })),
    })),
  };
}

/*
 * Merges workouts into "p35_hevy_workouts" by id or startTime (newest first)
 * and returns the merged list. This safely handles CSV imports that lack IDs.
 */
function mergeIntoStoredWorkouts(workouts: HevyWorkout[]): HevyWorkout[] {
  const existingRaw = localStorage.getItem("p35_hevy_workouts");

  let existingWorkouts: any[] = [];

  try {
    const parsed = existingRaw ? JSON.parse(existingRaw) : [];
    existingWorkouts = Array.isArray(parsed) ? parsed : [];
  } catch {
    existingWorkouts = [];
  }

  const workoutMap = new Map<string, any>();
  
  // Load existing workouts (uses startTime if ID is missing from CSV imports)
  existingWorkouts.forEach((w) => {
    const key = w.id || w.startTime;
    if (key) workoutMap.set(key, w);
  });
  
  // Load new API workouts
  workouts.forEach((w) => {
    const key = w.id || w.startTime;
    if (key) workoutMap.set(key, w);
  });

  const mergedWorkouts = Array.from(workoutMap.values()).sort((a, b) => {
    const timeA = new Date(a.startTime || "").getTime();
    const timeB = new Date(b.startTime || "").getTime();
    return timeB - timeA;
  });

  localStorage.setItem("p35_hevy_workouts", JSON.stringify(mergedWorkouts));

  return mergedWorkouts as HevyWorkout[];
}

export async function fetchLatestHevyWorkout({
  data,
}: {
  data: { apiKey: string };
}): Promise<{ workout: HevyWorkout | null; workouts: HevyWorkout[] }> {
  const cleanKey = data.apiKey.trim();
  if (!cleanKey) {
    throw new Error("Missing Hevy API key.");
  }

  const res = await fetch(hevyWorkoutsEndpoint(1), {
    headers: {
      "api-key": cleanKey,
      accept: "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Hevy rejected that API key. Check it in settings.");
  }
  if (!res.ok) {
    throw new Error(`Hevy request failed (${res.status}).`);
  }

  const json = (await res.json()) as { workouts?: RawHevyWorkout[] };

  const workouts: HevyWorkout[] = (json.workouts ?? []).map(mapRawWorkout);

  const latestWorkout = workouts[0] ?? null;

  try {
    if (latestWorkout) {
      localStorage.setItem("p35_cached_workout", JSON.stringify(latestWorkout));
    }

    if (workouts.length > 0) {
      const mergedWorkouts = mergeIntoStoredWorkouts(workouts);

      return {
        workout: latestWorkout,
        workouts: mergedWorkouts,
      };
    }
  } catch (e) {
    console.error("Failed to merge/save workouts to localStorage", e);
  }

  return {
    workout: latestWorkout,
    workouts,
  };
}

/*
 * ============================================================
 * TEMPORARY: HEVY HISTORY IMPORT
 * ============================================================
 *
 * Pages through the Hevy API (10 workouts per page, newest first) until it
 * reaches workouts older than `sinceDays`, then merges everything into
 * "p35_hevy_workouts" by id. Safe to run more than once.
 *
 * Delete this function (and the button in HevyCardLive) once the import
 * is done. Everything above is the normal sync, which is unchanged apart
 * from sharing the mapper and merge helper.
 */
export async function importHevyHistory({
  data,
}: {
  data: { apiKey: string; sinceDays?: number };
}): Promise<{
  imported: number;
  total: number;
  earliest: string | null;
}> {
  const cleanKey = data.apiKey.trim();
  if (!cleanKey) {
    throw new Error("Missing Hevy API key.");
  }

  const sinceDays = data.sinceDays ?? 120;
  const cutoff = Date.now() - sinceDays * 86_400_000;

  const collected: HevyWorkout[] = [];

  let page = 1;
  let pageCount = 1;

  // Hard cap of 60 pages (600 workouts) as a safety net.
  while (page <= pageCount && page <= 60) {
    const res = await fetch(hevyWorkoutsEndpoint(page), {
      headers: {
        "api-key": cleanKey,
        accept: "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error("Hevy rejected that API key. Check it in settings.");
    }
    if (!res.ok) {
      throw new Error(`Hevy request failed (${res.status}) on page ${page}.`);
    }

    const json = (await res.json()) as {
      page_count?: number;
      workouts?: RawHevyWorkout[];
    };

    pageCount = Number(json.page_count ?? 1);

    const batch = json.workouts ?? [];

    if (batch.length === 0) {
      break;
    }

    let reachedCutoff = false;

    for (const raw of batch) {
      const t = new Date(raw.start_time ?? "").getTime();

      if (!Number.isNaN(t) && t < cutoff) {
        reachedCutoff = true;
        continue;
      }

      collected.push(mapRawWorkout(raw));
    }

    if (reachedCutoff) {
      break;
    }

    page += 1;
  }

  if (collected.length === 0) {
    return { imported: 0, total: 0, earliest: null };
  }

  const merged = mergeIntoStoredWorkouts(collected);

  const earliestTime = collected
    .map((w) => new Date(w.startTime ?? "").getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)[0];

  return {
    imported: collected.length,
    total: merged.length,
    earliest: earliestTime ? new Date(earliestTime).toISOString() : null,
  };
}
