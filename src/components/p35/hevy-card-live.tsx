import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  fetchLatestHevyWorkout,
  // TEMPORARY IMPORT: remove this when you remove the import button.
  importHevyHistory,
  type HevyWorkout,
} from "@/lib/hevy.functions";
import { Activity, Download, Loader2, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";

function isCardioExercise(exerciseTitle: string, sets: any[]): boolean {
  const title = exerciseTitle.toLowerCase();
  const cardioKeywords = ["walk", "run", "treadmill", "elliptical", "cycle", "bike", "rowing", "stair"];
  const matchesKeyword = cardioKeywords.some((k) => title.includes(k));
  const hasCardioMetrics = sets.some(
    (s) =>
      s.distance_meters != null ||
      s.distanceMeters != null ||
      s.duration_seconds != null ||
      s.durationSeconds != null ||
      s.km != null ||
      (s.weightKg == null && s.weight_kg == null && s.weightLbs == null && s.reps == null)
  );
  return matchesKeyword || hasCardioMetrics;
}

function formatCardio(s: any): string {
  const meters =
    s.distance_meters ??
    s.distanceMeters ??
    s.distance ??
    (s.km != null ? s.km * 1000 : null);

  const kmString = meters != null ? `${(meters / 1000).toFixed(2)} km` : null;

  const totalSec =
    s.duration_seconds ??
    s.durationSeconds ??
    s.duration ??
    s.time;

  let timeString: string | null = null;
  if (typeof totalSec === "number") {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      timeString = `${hrs}h ${mins}min`;
    } else if (mins > 0) {
      timeString = `${mins}min`;
    } else {
      timeString = `${secs}s`;
    }
  } else if (typeof totalSec === "string") {
    timeString = totalSec;
  }

  const parts = [timeString, kmString].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Completed";
}

function formatWeight(weight: number | null | undefined, exerciseTitle: string) {
  if (weight == null) return "BW";

  const titleLower = exerciseTitle.toLowerCase();

  // Exclude "lat pulldown" from being caught by the "cable" keyword
  const isCableOrLbs =
    (titleLower.includes("cable") && !titleLower.includes("lat pulldown")) ||
    titleLower.includes("pushdown") ||
    titleLower.includes("fly");

  if (isCableOrLbs) {
    const weightLbs = weight * 2.20462;
    const roundedLbs = Math.round(weightLbs * 2) / 2;
    return `${roundedLbs}lbs`;
  }

  const roundedKg = Number.isInteger(weight) ? weight : Math.round(weight * 10) / 10;
  return `${roundedKg}kg`;
}

export function HevyCardLive({
  workout: initialWorkout,
  apiKey: initialApiKey,
  onSaveKey,
  onWorkout,
}: {
  workout: HevyWorkout | null;
  apiKey: string;
  onSaveKey?: ((key: string) => Promise<void>) | undefined;
  onWorkout?: ((workout: HevyWorkout) => Promise<void>) | undefined;
}) {
  const [activeKey, setActiveKey] = useState(() => {
    return localStorage.getItem("p35_hevy_api_key") || initialApiKey || "";
  });
  const [draftKey, setDraftKey] = useState(activeKey);
  const [currentWorkout, setCurrentWorkout] = useState<HevyWorkout | null>(() => {
    const cached = localStorage.getItem("p35_cached_workout");
    return cached ? JSON.parse(cached) : initialWorkout;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // TEMPORARY IMPORT: remove this state when you remove the import button.
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (initialApiKey && !activeKey) {
      setActiveKey(initialApiKey);
      setDraftKey(initialApiKey);
    }
  }, [initialApiKey]);

  const saveKey = async (value: string) => {
    try {
      const cleanKey = value.trim();
      localStorage.setItem("p35_hevy_api_key", cleanKey);
      setActiveKey(cleanKey);

      if (onSaveKey) {
        onSaveKey(cleanKey).catch(() => {});
      }

      toast.success(cleanKey ? "Hevy key saved locally." : "Key removed.");
      setSettingsOpen(false);
    } catch {
      toast.error("Could not save key to device storage.");
    }
  };

  const sync = async () => {
    const keyToUse = activeKey.trim();
    if (!keyToUse) {
      setSettingsOpen(true);
      toast.error("Add your Hevy API key first.");
      return;
    }
    setLoading(true);
    try {
      const result = await fetchLatestHevyWorkout({ data: { apiKey: keyToUse } });
      if (!result.workout) {
        toast.error("No workouts found on that Hevy account.");
      } else {
        setCurrentWorkout(result.workout);
        localStorage.setItem("p35_cached_workout", JSON.stringify(result.workout));
        if (onWorkout) {
          onWorkout(result.workout).catch(() => {});
        }
        toast.success("Latest Hevy workout synced.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hevy sync failed.");
    } finally {
      setLoading(false);
    }
  };

  /*
   *

  // ============================================================
  // CSV IMPORT
  // ============================================================

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;

        if (!text) {
          toast.error("CSV file was empty.");

          return;
        }

        // ======================================================
        // CSV PARSER
        // ======================================================

        const arr: string[][] = [];

        let quote = false;
        let row: string[] = [];
        let col = "";

        for (let c = 0; c < text.length; c++) {
          const cc = text[c];
          const nc = text[c + 1];

          if (cc === '"' && quote && nc === '"') {
            col += cc;
            c++;
            continue;
          }

          if (cc === '"') {
            quote = !quote;
            continue;
          }

          if (cc === "," && !quote) {
            row.push(col);
            col = "";
            continue;
          }

          if (cc === "\n" && !quote) {
            row.push(col);
            arr.push(row);
            row = [];
            col = "";
            continue;
          }

          if (cc === "\r" && !quote) {
            continue;
          }

          col += cc;
        }

        if (col || row.length > 0) {
          row.push(col);
        }

        if (row.length > 0) {
          arr.push(row);
        }

        if (arr.length < 2) {
          toast.error("Invalid CSV format.");

          return;
        }

        // ======================================================
        // HEADERS
        // ======================================================

        const headers = (arr[0] ?? []).map((h) => h.trim().toLowerCase());

        const findHeader = (...names: string[]) => {
          for (const name of names) {
            const index = headers.indexOf(name);

            if (index >= 0) {
              return index;
            }
          }

          return -1;
        };

        const iStart = findHeader("start_time", "start time", "date");

        const iTitle = findHeader("title", "workout_title", "workout title");

        const iExTitle = findHeader("exercise_title", "exercise title", "exercise");

        const iWeightKg = findHeader("weight_kg", "weight kg");

        const iWeightLbs = findHeader("weight_lbs", "weight lbs");

        const iReps = findHeader("reps", "repetitions");

        const iRpe = findHeader("rpe");

        const iDistance = findHeader("distance_meters", "distance meters", "distance");

        const iDuration = findHeader("duration_seconds", "duration seconds", "duration");

        if (iStart === -1 || iExTitle === -1) {
          toast.error("Missing required columns. Are you sure this is a Hevy export?");

          return;
        }

        // ======================================================
        // WORKOUT MAP
        // ======================================================

        const workoutsMap: Record<string, HevyHistoryWorkout> = {};

        // ======================================================
        // PROCESS CSV ROWS
        // ======================================================

        for (let i = 1; i < arr.length; i++) {
          const r = arr[i];

          if (!r || r.length === 0) {
            continue;
          }

          const startTimeRaw = r[iStart]?.trim();

          const title = iTitle >= 0 && r[iTitle]?.trim() ? (r[iTitle] ?? "").trim() : "Workout";

          const exTitle = r[iExTitle]?.trim();

          if (!startTimeRaw || !exTitle) {
            continue;
          }

          // ====================================================
          // NORMALISE DATE
          // ====================================================

          const parsedDate = parseWorkoutDate(startTimeRaw);

          if (!parsedDate) {
            console.warn("Could not parse Hevy workout date:", startTimeRaw);

            continue;
          }

          const isoStartTime = parsedDate.toISOString();

          const isoDate = isoStartTime.slice(0, 10);

          /*
           * Include the actual timestamp in the key.
           *
           * This prevents two workouts on the same day with
           * the same title from accidentally becoming one session.
           */

          const wKey = `${isoStartTime}_${title}`;

          if (!workoutsMap[wKey]) {
            workoutsMap[wKey] = {
              date: isoDate,
              startTime: isoStartTime,
              title,
              exercises: [],
            };
          }

          // ====================================================
          // FIND / CREATE EXERCISE
          // ====================================================

          let exObj = workoutsMap[wKey].exercises.find((e) => e.title === exTitle);

          if (!exObj) {
            exObj = {
              title: exTitle,
              sets: [],
            };

            workoutsMap[wKey].exercises.push(exObj);
          }

          // ====================================================
          // PARSE SET
          // ====================================================

          const rawWeightKg = iWeightKg >= 0 ? (r[iWeightKg] ?? "") : "";

          const rawWeightLbs = iWeightLbs >= 0 ? (r[iWeightLbs] ?? "") : "";

          const rawReps = iReps >= 0 ? (r[iReps] ?? "") : "";

          const rawRpe = iRpe >= 0 ? (r[iRpe] ?? "") : "";

          const rawDistance = iDistance >= 0 ? (r[iDistance] ?? "") : "";

          const rawDuration = iDuration >= 0 ? (r[iDuration] ?? "") : "";

          const weightKg = rawWeightKg !== "" ? parseFloat(rawWeightKg) : NaN;

          const weightLbs = rawWeightLbs !== "" ? parseFloat(rawWeightLbs) : NaN;

          const reps = rawReps !== "" ? parseInt(rawReps, 10) : NaN;

          const rpe = rawRpe !== "" ? parseFloat(rawRpe) : NaN;

          const distance = rawDistance !== "" ? parseFloat(rawDistance) : NaN;

          const duration = rawDuration !== "" ? parseFloat(rawDuration) : NaN;

          const hasWeightKg = !isNaN(weightKg);

          const hasWeightLbs = !isNaN(weightLbs);

          const hasReps = !isNaN(reps);

          const hasRpe = !isNaN(rpe);

          const hasDistance = !isNaN(distance);

          const hasDuration = !isNaN(duration);

          /*
           * Only discard the row if it contains absolutely
           * no useful workout information.
           */

          if (
            !hasWeightKg &&
            !hasWeightLbs &&
            !hasReps &&
            !hasRpe &&
            !hasDistance &&
            !hasDuration
          ) {
            exObj.sets.push({});
            continue;
          }

          const parsedSet: {
            weightKg?: number;
            weightLbs?: number;
            reps?: number;
            rpe?: number;
            distance_meters?: number;
            duration_seconds?: number;
          } = {};

          if (hasWeightKg) {
            parsedSet.weightKg = weightKg;
          }

          if (hasWeightLbs) {
            parsedSet.weightLbs = weightLbs;
          }

          if (hasReps) {
            parsedSet.reps = reps;
          }

          if (hasRpe) {
            parsedSet.rpe = rpe;
          }

          if (hasDistance) {
            parsedSet.distance_meters = distance;
          }

          if (hasDuration) {
            parsedSet.duration_seconds = duration;
          }

          exObj.sets.push(parsedSet);
        }

        // ======================================================
        // BUILD HISTORY
        // ======================================================

        const history = Object.values(workoutsMap).filter((workout) =>
          workout.exercises.some((exercise) => exercise.sets.length > 0),
        );

        if (history.length === 0) {
          toast.error("No valid workouts could be found in the CSV.");

          return;
        }

        // ======================================================
        // SORT NEWEST FIRST
        // ======================================================

        history.sort((a, b) => {
          const aTime = parseWorkoutDate(a.startTime)?.getTime() ?? 0;

          const bTime = parseWorkoutDate(b.startTime)?.getTime() ?? 0;

          return bTime - aTime;
        });

        // ======================================================
        // SAVE COMPLETE HEVY HISTORY
        // ======================================================

        localStorage.setItem("p35_hevy_workouts", JSON.stringify(history));

        // ======================================================
        // MAKE NEWEST WORKOUT ACTIVE
        // ======================================================

        const newest = history[0];

        if (!newest) {
          throw new Error("No workouts found in CSV.");
        }

        const latestWorkout: ManualHevyWorkout = {
          title: newest.title || "Hevy Workout",

          startTime: newest.startTime || new Date().toISOString(),

          exercises: newest.exercises ?? [],
        };

        localStorage.setItem("p35_cached_workout", JSON.stringify(latestWorkout));

        setCurrentWorkout(latestWorkout);

        window.dispatchEvent(
          new CustomEvent("p35:workout-updated", {
            detail: latestWorkout,
          }),
        );

        if (onWorkout) {
          onWorkout(latestWorkout).catch((error) => {
            console.error("Failed to sync imported workout:", error);
          });
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        toast.success(
          `Imported ${history.length} historical workouts. Latest session: ${latestWorkout.title}`,
        );
      } catch (error) {
        console.error("Hevy CSV import error:", error);

        toast.error("Something went wrong while importing the Hevy CSV.");
      }
    };

    reader.readAsText(file);
  };

  const displayWorkout = currentWorkout || initialWorkout;

  return (
    <section className="panel p-5"> ============================================================
   * TEMPORARY: IMPORT HEVY HISTORY
   * ============================================================
   *
   * Pulls the last 120 days of workouts into "p35_hevy_workouts".
   * Safe to run more than once (merged by workout id).
   *
   * Remove this function, the `importing` state, the importHevyHistory
   * import, the Download icon import and the button below when done.
   */
  const importHistory = async () => {
    const keyToUse = activeKey.trim();
    if (!keyToUse) {
      setSettingsOpen(true);
      toast.error("Add your Hevy API key first.");
      return;
    }

    setImporting(true);

    try {
      const result = await importHevyHistory({
        data: { apiKey: keyToUse, sinceDays: 120 },
      });

      if (result.imported === 0) {
        toast.error("No workouts found in the last 120 days.");
        return;
      }

      const earliestLabel = result.earliest
        ? new Date(result.earliest).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : null;

      toast.success(
        `Imported ${result.imported} workouts${
          earliestLabel ? ` back to ${earliestLabel}` : ""
        }. ${result.total} stored in total.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Hevy history import failed."
      );
    } finally {
      setImporting(false);
    }
  };

  const displayWorkout = currentWorkout || initialWorkout;

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h2 className="text-lg font-bold">Latest Workout</h2>
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Hevy settings">
              <Settings className="size-5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hevy API Key</DialogTitle>
              <DialogDescription>
                Saved privately to your phone's browser. Get your key from the Hevy developer settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="hevy-key">API key</Label>
              <Input
                id="hevy-key"
                type="password"
                autoComplete="off"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="Paste your Hevy API key"
              />
            </div>
            <DialogFooter className="gap-2">
              {activeKey && (
                <Button variant="ghost" onClick={() => void saveKey("")}>
                  Remove key
                </Button>
              )}
              <Button onClick={() => void saveKey(draftKey)}>Save key</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {displayWorkout ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border bg-surface-2/60 p-3">
            <p className="text-sm font-semibold text-primary">{displayWorkout.title}</p>
            <p className="text-xs text-muted-foreground">
              {displayWorkout.startTime ? new Date(displayWorkout.startTime).toLocaleString() : "Date unknown"}
            </p>
          </div>
          <div className="space-y-2">
            {displayWorkout.exercises.map((ex, i) => {
              const lastSet = ex.sets[ex.sets.length - 1];
              const isCardio = isCardioExercise(ex.title, ex.sets);

              return (
                <div key={i} className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{ex.title}</p>
                    <span className="stat-label shrink-0">
                      {ex.sets.length} {ex.sets.length === 1 ? "set" : "sets"}
                    </span>
                  </div>

                  {isCardio ? (
                    <div className="mt-1.5 space-y-1">
                      {ex.sets.map((s: any, sIdx: number) => (
                        <p key={sIdx} className="text-xs font-medium text-primary">
                          {formatCardio(s)}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {ex.sets.map((s, sIdx) => {
                        const weightDisplay = formatWeight(s.weightKg, ex.title);
                        return (
                          <div key={sIdx} className="flex items-center gap-2">
                            {sIdx > 0 && <span className="size-1 rounded-full bg-primary/60 shrink-0" />}
                            <span>{`${weightDisplay} \u00d7 ${s.reps ?? "?"}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!isCardio && lastSet?.rpe != null && (
                    <p className="mt-1.5 text-xs font-medium text-primary">
                      Final set RPE: {lastSet.rpe}
                    </p>
                  )}
                  {ex.notes && (
                    <p className="mt-1.5 text-xs text-muted-foreground italic leading-relaxed">
                      &ldquo;{ex.notes}&rdquo;
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No workout synced yet. Add your key and pull your latest session.
        </p>
      )}

      <Button className="mt-4 w-full" onClick={() => void sync()} disabled={loading || importing}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Sync Hevy Workout
      </Button>

      {/* ======================================================
          TEMPORARY: IMPORT HISTORY BUTTON
          Delete this block after the import is done.
          ====================================================== */}
      <Button
        variant="outline"
        className="mt-2 w-full"
        onClick={() => void importHistory()}
        disabled={loading || importing}
      >
        {importing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {importing ? "Importing history…" : "Import Hevy History (120 days)"}
      </Button>
    </section>
  );
}
