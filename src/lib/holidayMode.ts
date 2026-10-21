import type { HabitDefinition } from "./planTypes";

export const HOLIDAY_STORAGE_KEY = "p35_holiday_periods";
export const HOLIDAY_UPDATED_EVENT = "p35-holiday-updated";
export const HOLIDAY_HABIT_PREFIX = "holiday_";

/**
 * A short window where the normal daily non-negotiables are swapped for
 * agreed holiday habits. Roadmap and block dates are never touched.
 */
export type HolidayPeriod = {
  id: string;
  title: string;
  /** Inclusive YYYY-MM-DD bounds. */
  start: string;
  end: string;
  habits: HabitDefinition[];
  summary?: string;
  createdAt: string;
};

export type HolidayDraft = {
  title: string;
  days: number;
  habits: { label: string; sublabel?: string }[];
  summary?: string;
};

export const MIN_HOLIDAY_DAYS = 1;
export const MAX_HOLIDAY_DAYS = 14;

export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function holidayLength(period: Pick<HolidayPeriod, "start" | "end">): number {
  const start = new Date(`${period.start}T00:00:00Z`).getTime();
  const end = new Date(`${period.end}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function formatHolidayRange(period: Pick<HolidayPeriod, "start" | "end">): string {
  const fmt = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(period.start)} – ${fmt(period.end)}`;
}

export function getHolidayPeriods(): HolidayPeriod[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HOLIDAY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HolidayPeriod[]) : [];
  } catch {
    return [];
  }
}

export function saveHolidayPeriods(periods: HolidayPeriod[]) {
  if (typeof window === "undefined") return;
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  localStorage.setItem(HOLIDAY_STORAGE_KEY, JSON.stringify(sorted));
  window.dispatchEvent(new Event(HOLIDAY_UPDATED_EVENT));
}

export function getHolidayForDate(dateKey: string): HolidayPeriod | null {
  return getHolidayPeriods().find((p) => dateKey >= p.start && dateKey <= p.end) ?? null;
}

/** Holidays that overlap the inclusive range, in date order. */
export function getHolidaysInRange(startKey: string, endKey: string): HolidayPeriod[] {
  return getHolidayPeriods().filter((p) => p.start <= endKey && p.end >= startKey);
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "habit"
  );
}

export function buildHolidayHabits(
  drafts: HolidayDraft["habits"],
  periodTag: string,
): HabitDefinition[] {
  const used = new Set<string>();
  return drafts
    .filter((h) => typeof h?.label === "string" && h.label.trim())
    .map((h) => {
      const base = `${HOLIDAY_HABIT_PREFIX}${periodTag}_${slugify(h.label)}`;
      let key = base;
      let n = 2;
      while (used.has(key)) key = `${base}_${n++}`;
      used.add(key);
      return {
        key,
        label: h.label.trim(),
        sublabel: h.sublabel?.trim() || "Holiday Habit",
        isWeekdayOnly: false,
      };
    });
}

/** Starts a holiday on `startKey`, trimming any holiday that overlaps it. */
export function activateHolidayMode(draft: HolidayDraft, startKey: string): HolidayPeriod {
  const days = Math.min(
    MAX_HOLIDAY_DAYS,
    Math.max(MIN_HOLIDAY_DAYS, Math.round(Number(draft.days) || 7)),
  );
  const end = shiftDateKey(startKey, days - 1);

  const createdMs = Date.now();
  const period: HolidayPeriod = {
    id: `${startKey}-${createdMs}`,
    title: draft.title?.trim() || "Holiday Week",
    start: startKey,
    end,
    habits: buildHolidayHabits(draft.habits ?? [], createdMs.toString(36)),
    ...(draft.summary?.trim() ? { summary: draft.summary.trim() } : {}),
    createdAt: new Date().toISOString(),
  };

  const kept = getHolidayPeriods().flatMap((p) => {
    if (p.end < startKey || p.start > end) return [p];
    if (p.start < startKey) return [{ ...p, end: shiftDateKey(startKey, -1) }];
    return [];
  });

  saveHolidayPeriods([...kept, period]);
  return period;
}

/** Ends a holiday so `todayKey` is back on plan; past holiday days stay recorded. */
export function endHolidayMode(id: string, todayKey: string) {
  const next = getHolidayPeriods().flatMap((p) => {
    if (p.id !== id) return [p];
    if (p.start >= todayKey) return [];
    return [{ ...p, end: shiftDateKey(todayKey, -1) }];
  });
  saveHolidayPeriods(next);
}
