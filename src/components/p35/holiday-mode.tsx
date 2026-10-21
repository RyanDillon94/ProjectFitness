import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Loader2, Palmtree, Send, X } from "lucide-react";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/config";
import { DAILY_TARGETS, getActiveHabits, todayKey } from "@/lib/project35";
import {
  MAX_HOLIDAY_DAYS,
  MIN_HOLIDAY_DAYS,
  activateHolidayMode,
  endHolidayMode,
  formatHolidayRange,
  holidayLength,
  shiftDateKey,
  type HolidayDraft,
  type HolidayPeriod,
} from "@/lib/holidayMode";
import { callGemini, FormattedMessage, type ChatMessage } from "./RecalibrateModal";

function buildHolidaySystemPrompt(startKey: string): string {
  const normalHabits = getActiveHabits(new Date(`${startKey}T12:00:00Z`))
    .map((h) => `- ${h.label} (${h.sublabel})`)
    .join("\n");

  return `You are the ${APP_NAME} performance coach.

The athlete is about to go on holiday and wants to switch on HOLIDAY MODE.

Holiday Mode temporarily replaces the athlete's normal daily non-negotiables with a
short list of holiday habits for a fixed number of days starting TODAY (${startKey}).
It does NOT change the roadmap, phases, block dates or daily targets. The week is simply
marked as "off plan" in the archive.

NORMAL DAILY NON-NEGOTIABLES (paused during the holiday):
${normalHabits}

NORMAL DAILY TARGETS: ${DAILY_TARGETS.caloriesMin}–${DAILY_TARGETS.caloriesMax} kcal, ${DAILY_TARGETS.protein}g+ protein, ${DAILY_TARGETS.steps} steps.

============================================================
YOUR JOB
============================================================

1. Briefly find out what the holiday looks like: how many days (normally 5–7, starting today),
   where/what kind of trip, gym or kit access, eating out, drinking, activity levels.
   Ask at most 2–3 short questions at a time.
2. Propose 3–6 realistic holiday habits. Each must be a simple daily yes/no checkbox the
   athlete can tick every day of the holiday (e.g. "8,000+ steps", "Protein with every meal",
   "Max 4 drinks", "2L water", "15 min bodyweight circuit"). Keep them achievable — the goal is
   to protect momentum, not to pretend it is a normal training week.
3. Confirm the number of days (${MIN_HOLIDAY_DAYS}–${MAX_HOLIDAY_DAYS}) and the final habit list.
4. Ask the athlete to explicitly confirm.

Do NOT generate JSON until the athlete explicitly confirms (e.g. "Yes", "Do it", "Lock it in",
"Sounds good", "Activate it").

============================================================
FINAL JSON
============================================================

ONLY after explicit confirmation, briefly state what was agreed, then output:

\`\`\`json
{
  "title": "Short holiday name, e.g. Tenerife Week",
  "days": 7,
  "habits": [
    { "label": "8,000+ Steps", "sublabel": "Explore on foot" }
  ],
  "summary": "One sentence describing the holiday approach."
}
\`\`\`

Do not modify localStorage. The application handles saving.

============================================================
FORMATTING
============================================================

Be direct and friendly. No emoji. Keep replies short, use blank lines between sections.`;
}

function parseHolidayDraft(raw: unknown): HolidayDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const habits = Array.isArray(data["habits"])
    ? (data["habits"] as unknown[])
        .map((h) => {
          if (typeof h === "string") return { label: h };
          if (h && typeof h === "object") {
            const obj = h as Record<string, unknown>;
            const label = typeof obj["label"] === "string" ? obj["label"] : "";
            const sublabel = typeof obj["sublabel"] === "string" ? obj["sublabel"] : undefined;
            return sublabel ? { label, sublabel } : { label };
          }
          return { label: "" };
        })
        .filter((h) => h.label.trim())
    : [];

  if (habits.length === 0) return null;

  const summary = typeof data["summary"] === "string" ? data["summary"] : undefined;
  return {
    title: typeof data["title"] === "string" ? data["title"] : "Holiday Week",
    days: Number(data["days"]) || 7,
    habits,
    ...(summary ? { summary } : {}),
  };
}

export function HolidayModeDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pending, setPending] = useState<HolidayDraft | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startKey = todayKey();

  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [isOpen, messages.length, isTyping, pending]);

  const resetTextarea = useCallback(() => {
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open && messages.length === 0) {
        setMessages([
          {
            role: "model",
            text: "Holiday Mode. Your normal non-negotiables get paused and we set a few holiday habits instead — block dates stay exactly as they are.\n\nWhere are you going, how many days is it, and what will food, drink and activity look like?",
          },
        ]);
      }
      if (!open) {
        setPending(null);
        resetTextarea();
      }
    },
    [messages.length, resetTextarea],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping || pending) return;

      const apiKey = localStorage.getItem("p35_gemini_api_key")?.replace(/\s+/g, "") || "";
      if (!apiKey) {
        toast.error("Gemini API key missing. Add it in the Coach first.");
        return;
      }

      const nextMessages: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
      setMessages(nextMessages);
      resetTextarea();
      setIsTyping(true);

      try {
        const reply = await callGemini(apiKey, nextMessages, buildHolidaySystemPrompt(startKey));
        const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);

        if (jsonMatch) {
          let draft: HolidayDraft | null = null;
          try {
            draft = parseHolidayDraft(JSON.parse((jsonMatch[1] ?? "").trim()));
          } catch (error) {
            console.error("Failed to parse holiday JSON", error, reply);
          }

          if (!draft) {
            toast.error("The coach generated invalid holiday habits. Ask it to try again.");
            return;
          }

          const explanation = reply.replace(/```json\s*[\s\S]*?```/g, "").trim();
          setPending(draft);
          setMessages([
            ...nextMessages,
            {
              role: "model",
              text: explanation || "Holiday habits are ready. Review them below before activating.",
            },
          ]);
          return;
        }

        setMessages([...nextMessages, { role: "model", text: reply }]);
      } catch (error) {
        console.error("Gemini request failed:", error);
        toast.error(error instanceof Error ? error.message : "Failed to connect to Coach.");
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping, pending, resetTextarea, startKey],
  );

  const activate = useCallback(() => {
    if (!pending) return;
    try {
      const period = activateHolidayMode(pending, startKey);
      toast.success(`Holiday Mode active: ${formatHolidayRange(period)}`);
      setPending(null);
      setIsOpen(false);
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      console.error("Failed to activate holiday mode", error);
      toast.error("Could not activate Holiday Mode.");
    }
  }, [pending, startKey]);

  const discard = useCallback(() => {
    setPending(null);
    setMessages((current) => [
      ...current,
      { role: "model", text: "Not activated. What would you like to change?" },
    ]);
  }, []);

  const pendingDays = pending
    ? Math.min(MAX_HOLIDAY_DAYS, Math.max(MIN_HOLIDAY_DAYS, Math.round(pending.days)))
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
        >
          <Palmtree className="size-4" />
          Holiday Mode
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-lg h-[100dvh] max-h-[100dvh] sm:h-[90dvh] sm:max-h-[90dvh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="shrink-0 px-4 pt-5 pb-4 pr-12 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <Palmtree className="size-5" />
            Holiday Mode
          </DialogTitle>
          <DialogDescription>
            Agree your holiday habits with the coach. Your roadmap and block dates stay unchanged.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 px-4 py-4"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2/60 text-foreground"
                }`}
              >
                {message.role === "model" ? <FormattedMessage text={message.text} /> : message.text}
              </div>
            </div>
          ))}

          {pending && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Palmtree className="size-4 text-amber-500" />
                <p className="text-sm font-semibold text-amber-500">{pending.title}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatHolidayRange({
                  start: startKey,
                  end: shiftDateKey(startKey, pendingDays - 1),
                })}{" "}
                ({pendingDays} {pendingDays === 1 ? "day" : "days"})
              </p>
              {pending.summary && (
                <p className="text-xs text-muted-foreground italic">{pending.summary}</p>
              )}
              <ul className="space-y-1.5">
                {pending.habits.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium">{h.label}</span>
                      {h.sublabel && (
                        <span className="block text-[11px] text-muted-foreground">
                          {h.sublabel}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={discard}>
                  <X className="size-4 mr-1.5" />
                  Change
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-amber-500 text-black hover:bg-amber-600"
                  onClick={activate}
                >
                  <Palmtree className="size-4 mr-1.5" />
                  Activate
                </Button>
              </div>
            </div>
          )}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-surface-2/60 text-muted-foreground rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Coach is thinking...
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 p-0 border-t border-border/40">
          <div className="w-full pt-2 pb-4 px-4">
            <div className="flex items-end gap-2 bg-surface-2/50 border border-border rounded-xl p-2 focus-within:border-amber-500 transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                disabled={isTyping || !!pending}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder={
                  pending
                    ? "Activate or change the holiday habits above..."
                    : "e.g. 7 days in Spain, all-inclusive, hotel gym..."
                }
                className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none max-h-32 py-1.5 px-2 leading-relaxed disabled:opacity-50"
              />
              <Button
                size="icon"
                className="size-9 shrink-0 mb-0.5 rounded-lg"
                onClick={() => void sendMessage(input)}
                disabled={!input.trim() || isTyping || !!pending}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HolidayBanner({
  holiday,
  selectedDay,
}: {
  holiday: HolidayPeriod;
  selectedDay: string;
}) {
  const actualToday = todayKey();
  const totalDays = holidayLength(holiday);
  const dayNumber = holidayLength({ start: holiday.start, end: selectedDay });
  const isLive = actualToday >= holiday.start && actualToday <= holiday.end;

  const handleEnd = () => {
    if (!window.confirm("End Holiday Mode and go back to your normal non-negotiables from today?"))
      return;
    endHolidayMode(holiday.id, actualToday);
    toast.success("Holiday Mode ended. Back on plan.");
    window.setTimeout(() => window.location.reload(), 250);
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Palmtree className="size-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Holiday Mode · Off Plan
            </p>
            <p className="text-sm font-semibold text-foreground break-words">{holiday.title}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
          Day {dayNumber}/{totalDays}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{formatHolidayRange(holiday)}</p>
      {holiday.summary && <p className="text-xs text-muted-foreground italic">{holiday.summary}</p>}
      <p className="text-[11px] text-muted-foreground/80">
        Normal calorie, protein and step targets are paused. Roadmap dates are unchanged.
      </p>
      {isLive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEnd}
          className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
        >
          End Holiday Mode
        </Button>
      )}
    </div>
  );
}
