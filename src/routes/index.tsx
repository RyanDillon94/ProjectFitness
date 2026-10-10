import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { DashboardHeader } from "@/components/p35/header";
import { NonNegotiables } from "@/components/p35/non-negotiables";
import { WeeklyProtocolCard } from "@/components/p35/WeeklyProtocolCard";
import { PhotoCheckpoint } from "@/components/p35/photo-checkpoint";
import { WeightCard } from "@/components/p35/weight-card";
import { HevyCard } from "@/components/p35/hevy-card";
import { CoachDrawer } from "@/components/p35/coach-drawer";
import { Roadmap } from "@/components/p35/roadmap";
import { DataBackupCard } from "@/components/p35/data-backup-card";
import { DeloadCard } from "@/components/p35/deload-card";
import { FinaliseWeekBanner } from "@/components/p35/finalise-week-banner";
import { useUserSettings, useWeighIns } from "@/lib/p35-cloud";
import { WeeklyTrendsAnalytics } from "@/components/p35/weekly-trends-analytics";
import { MissionArchiveCard } from "@/components/p35/mission-archive-card";
import { todayKey } from "@/lib/project35";
import { getPlanBlueprint, needsOnboarding, seedPlanIfMissing } from "@/lib/planEngine";
import { Onboarding } from "@/components/p35/Onboarding";
import { APP_HEADLINE } from "@/lib/config";
import { TestModePanel } from '../components/TestModePanel';
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => {
    const blueprint = getPlanBlueprint();
    const title = APP_HEADLINE;
    const description = blueprint.tagline;
    const ogDescription = blueprint.footerQuote || blueprint.tagline;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: ogDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Index,
});

function Index() {
  const [isMounted, setIsMounted] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    seedPlanIfMissing();
    setIsMounted(true);
    setNeedsSetup(needsOnboarding());
  }, []);

  if (!isMounted) return null;

  if (needsSetup) {
    return <Onboarding onComplete={() => window.location.reload()} />;
  }

  return <Dashboard userId="local-user" />;
}

function Dashboard({ userId }: { userId: string }) {
  const { entries, save } = useWeighIns(userId);
  const { hevyApiKey, workout, update } = useUserSettings(userId);
  const [isFinalised, setIsFinalised] = useState(false);
  
  const [currentDate, setCurrentDate] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("p35_active_date") || todayKey();
    }
    return todayKey();
  });

  useEffect(() => {
    const appBootDay = todayKey();
    localStorage.setItem("p35_active_date", appBootDay);
    setCurrentDate(appBootDay);
    window.dispatchEvent(new Event("p35-date-changed"));

    const handleWakeUp = () => {
      if (document.visibilityState === "visible") {
        if (todayKey() !== appBootDay) {
          localStorage.setItem("p35_active_date", todayKey());
          window.location.reload();
        }
      }
    };

    document.addEventListener("visibilitychange", handleWakeUp);
    window.addEventListener("focus", handleWakeUp);

    const checkMidnight = setInterval(() => {
      if (todayKey() !== appBootDay) {
        localStorage.setItem("p35_active_date", todayKey());
        window.location.reload();
      }
    }, 5000);

    return () => {
      document.removeEventListener("visibilitychange", handleWakeUp);
      window.removeEventListener("focus", handleWakeUp);
      clearInterval(checkMidnight);
    };
  }, []);

  useEffect(() => {
    const updateDateAndStatus = () => {
      const active = localStorage.getItem("p35_active_date") || todayKey();
      setCurrentDate(active);

      const weekKey = `p35_finalised_week_${active}`;
      setIsFinalised(localStorage.getItem(weekKey) !== null);
    };

    updateDateAndStatus();

    window.addEventListener("p35-week-finalised", updateDateAndStatus);
    window.addEventListener("storage", updateDateAndStatus);
    window.addEventListener("p35-date-changed", updateDateAndStatus as EventListener);
    
    const interval = setInterval(updateDateAndStatus, 300);

    return () => {
      window.removeEventListener("p35-week-finalised", updateDateAndStatus);
      window.removeEventListener("storage", updateDateAndStatus);
      window.removeEventListener("p35-date-changed", updateDateAndStatus as EventListener);
      clearInterval(interval);
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 overflow-x-hidden px-4 pt-5 pb-28">

      {!isFinalised && <FinaliseWeekBanner userId={userId} key={`top-${currentDate}`} />}

      <DashboardHeader />
      <NonNegotiables userId={userId} />
      
      <WeeklyProtocolCard currentDate={currentDate} />

      <HevyCard
        workout={workout}
        apiKey={hevyApiKey}
        onSaveKey={(key) => update.mutateAsync({ hevyApiKey: key })}
        onWorkout={(next) => update.mutateAsync({ workout: next })}
      />
      <WeightCard
        entries={entries}
        saving={save.isPending}
        onSave={(entry) => save.mutateAsync(entry)}
      />
      <PhotoCheckpoint userId={userId} />
      <Roadmap />

      {/* Footer Management Section */}
      <div className="flex flex-col items-center gap-2 pt-4 border-t border-border/40">
        <WeeklyTrendsAnalytics/>
        <MissionArchiveCard />
        <DataBackupCard />
      </div>

      {isFinalised && <FinaliseWeekBanner userId={userId} key={`bot-${currentDate}`} />}

      <CoachDrawer workout={workout} entries={entries} userId={userId} />
      {/* <TestModePanel /> */}

    </main>
  );
}

/*
function ImportHevyData() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseWorkoutDate = (rawDate: string): Date | null => {
    if (!rawDate) return null;
    const value = rawDate.trim();

    const directDate = new Date(value);
    if (!isNaN(directDate.getTime())) return directDate;

    const cleaned = value.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s{0,}/i, "");
    const hevyMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);

    if (hevyMatch) {
      const [, monthName, dayStr, yearStr, hourStr, minuteStr, ampm] = hevyMatch;
      const months: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
        may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
        oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
      };
      const month = months[monthName.toLowerCase()];
      if (month != null) {
        let hour = parseInt(hourStr, 10);
        if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
        if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
        const date = new Date(Number(yearStr), month, Number(dayStr), hour, Number(minuteStr));
        if (!isNaN(date.getTime())) return date;
      }
    }

    const ukMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (ukMatch) {
      const [, dayStr, monthStr, yearStr, hourStr = "0", minuteStr = "0"] = ukMatch;
      const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr), Number(hourStr), Number(minuteStr));
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        if (!text) {
          alert("CSV file was empty.");
          return;
        }

        const arr: string[][] = [];
        let quote = false;
        let row: string[] = [];
        let col = "";

        for (let c = 0; c < text.length; c++) {
          const cc = text[c];
          const nc = text[c + 1];

          if (cc === '"' && quote && nc === '"') {
            col += cc; c++; continue;
          }
          if (cc === '"') {
            quote = !quote; continue;
          }
          if (cc === "," && !quote) {
            row.push(col); col = ""; continue;
          }
          if (cc === "\n" && !quote) {
            row.push(col); arr.push(row); row = []; col = ""; continue;
          }
          if (cc === "\r" && !quote) continue;
          col += cc;
        }
        if (col || row.length > 0) row.push(col);
        if (row.length > 0) arr.push(row);

        if (arr.length < 2) {
          alert("Invalid CSV format.");
          return;
        }

        const headers = (arr[0] ?? []).map((h) => h.trim().toLowerCase());
        const findHeader = (...names: string[]) => {
          for (const name of names) {
            const index = headers.indexOf(name);
            if (index >= 0) return index;
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
          alert("Missing required columns. Are you sure this is a Hevy export?");
          return;
        }

        const workoutsMap: Record<string, any> = {};

        for (let i = 1; i < arr.length; i++) {
          const r = arr[i];
          if (!r || r.length === 0) continue;

          const startTimeRaw = r[iStart]?.trim();
          const title = iTitle >= 0 && r[iTitle]?.trim() ? (r[iTitle] ?? "").trim() : "Workout";
          const exTitle = r[iExTitle]?.trim();

          if (!startTimeRaw || !exTitle) continue;

          const parsedDate = parseWorkoutDate(startTimeRaw);
          if (!parsedDate) continue;

          const isoStartTime = parsedDate.toISOString();
          const isoDate = isoStartTime.slice(0, 10);
          const wKey = `${isoStartTime}_${title}`;

          if (!workoutsMap[wKey]) {
            workoutsMap[wKey] = {
              date: isoDate,
              startTime: isoStartTime,
              title,
              exercises: [],
            };
          }

          let exObj = workoutsMap[wKey].exercises.find((e: any) => e.title === exTitle);
          if (!exObj) {
            exObj = { title: exTitle, sets: [] };
            workoutsMap[wKey].exercises.push(exObj);
          }

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

          if (!hasWeightKg && !hasWeightLbs && !hasReps && !hasRpe && !hasDistance && !hasDuration) {
            exObj.sets.push({});
            continue;
          }

          const parsedSet: any = {};
          if (hasWeightKg) parsedSet.weightKg = weightKg;
          if (hasWeightLbs) parsedSet.weightLbs = weightLbs;
          if (hasReps) parsedSet.reps = reps;
          if (hasRpe) parsedSet.rpe = rpe;
          if (hasDistance) parsedSet.distance_meters = distance;
          if (hasDuration) parsedSet.duration_seconds = duration;

          exObj.sets.push(parsedSet);
        }

        const history = Object.values(workoutsMap).filter((workout: any) =>
          workout.exercises.some((exercise: any) => exercise.sets.length > 0),
        );

        if (history.length === 0) {
          alert("No valid workouts could be found in the CSV.");
          return;
        }

        history.sort((a: any, b: any) => {
          const aTime = parseWorkoutDate(a.startTime)?.getTime() ?? 0;
          const bTime = parseWorkoutDate(b.startTime)?.getTime() ?? 0;
          return bTime - aTime;
        });

        localStorage.setItem("p35_hevy_workouts", JSON.stringify(history));

        const newest = history[0];
        const latestWorkout = {
          title: newest.title || "Hevy Workout",
          startTime: newest.startTime || new Date().toISOString(),
          exercises: newest.exercises ?? [],
        };
        localStorage.setItem("p35_cached_workout", JSON.stringify(latestWorkout));

        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new CustomEvent("p35:workout-updated", { detail: latestWorkout }));

        if (fileInputRef.current) fileInputRef.current.value = "";
        
        alert(`Imported ${history.length} historical workouts successfully!`);
      } catch (error) {
        console.error("Hevy CSV import error:", error);
        alert("Something went wrong while importing the Hevy CSV.");
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="flex items-center gap-4 w-full">
      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        className="hidden"
        onChange={handleCSVUpload}
      />
      <Button 
        variant="secondary" 
        onClick={() => fileInputRef.current?.click()}
        className="gap-2 w-full"
      >
        <Upload className="size-4" />
        Import Hevy CSV
      </Button>
    </div>
  );
}
*/
