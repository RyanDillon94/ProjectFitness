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
        <ImportHevyData />
      </div>

      {isFinalised && <FinaliseWeekBanner userId={userId} key={`bot-${currentDate}`} />}

      <CoachDrawer workout={workout} entries={entries} userId={userId} />
      {/* <TestModePanel /> */}

    </main>
  );
}

// Separate component function at the bottom level of the file
export function ImportHevyData() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result as string;
        JSON.parse(result); 
        
        localStorage.setItem("p35_hevy_workouts", result);
        window.dispatchEvent(new Event("storage")); 
        alert("Hevy history imported successfully!");
        
      } catch (error) {
        console.error("Failed to parse Hevy data", error);
        alert("Invalid file format. Please upload a valid Hevy JSON export.");
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex items-center gap-4 w-full">
      <input
        type="file"
        accept=".json"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileUpload}
      />
      <Button 
        variant="secondary" 
        onClick={() => fileInputRef.current?.click()}
        className="gap-2 w-full"
      >
        <Upload className="size-4" />
        Import Hevy JSON
      </Button>
    </div>
  );
}
