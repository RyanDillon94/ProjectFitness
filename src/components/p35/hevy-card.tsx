import { IS_PROJECT_35 } from "@/lib/config";
import type { HevyWorkout } from "@/lib/hevy.functions";
import { HevyCardLive } from "./hevy-card-live";
import { HevyCardManual, type ManualHevyWorkout } from "./hevy-card-manual";

export type { HevyWorkout };

type HevyCardProps = {
  workout: HevyWorkout | null;
  apiKey: string;
  onSaveKey?: (key: string) => Promise<void>;
  onWorkout?: (workout: HevyWorkout) => Promise<void>;
};

function toManual(workout: HevyWorkout | null): ManualHevyWorkout | null {
  if (!workout) return null;

  return {
    title: workout.title,
    startTime: workout.startTime ?? "",
    exercises: workout.exercises.map((exercise) => ({
      title: exercise.title,
      notes: exercise.notes ?? undefined,
      sets: exercise.sets.map((set) => ({
        weightKg: set.weightKg ?? undefined,
        reps: set.reps ?? undefined,
        rpe: set.rpe ?? undefined,
        distance_meters: set.distanceMeters ?? undefined,
        duration_seconds: set.durationSeconds ?? undefined,
      })),
    })),
  };
}

function toCanonical(workout: ManualHevyWorkout): HevyWorkout {
  return {
    id: `manual-${workout.startTime || Date.now()}`,
    title: workout.title,
    startTime: workout.startTime || null,
    endTime: null,
    exercises: workout.exercises.map((exercise) => ({
      title: exercise.title,
      notes: exercise.notes ?? null,
      sets: exercise.sets.map((set) => ({
        weightKg: set.weightKg ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        distanceMeters: set.distance_meters ?? null,
        durationSeconds: set.duration_seconds ?? null,
      })),
    })),
  };
}

/**
 * Project 35 syncs straight from the Hevy API. Ascension has no API key and
 * pastes the workout text (or imports a CSV) instead.
 */
export function HevyCard({ workout, apiKey, onSaveKey, onWorkout }: HevyCardProps) {
  if (IS_PROJECT_35) {
    return (
      <HevyCardLive workout={workout} apiKey={apiKey} onSaveKey={onSaveKey} onWorkout={onWorkout} />
    );
  }

  return (
    <HevyCardManual
      workout={toManual(workout)}
      onWorkout={onWorkout ? (next) => onWorkout(toCanonical(next)) : undefined}
    />
  );
}
