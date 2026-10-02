import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { Check, Loader2, Send, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/config";
import { getPlan, savePlan } from "@/lib/planEngine";
import type { PlanState } from "@/lib/planTypes";

// ============================================================
// PERFORMANCE
// ============================================================

const MODEL_COOLDOWN_MS = 60_000;
const MODEL_TIMEOUT_MS = 7_000;

const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

// ============================================================
// MODULE CACHE
// ============================================================

const systemPromptCache = new WeakMap<object, string>();
const modelCooldowns = new Map<string, number>();

// ============================================================
// FORMATTED AI MESSAGE
// ============================================================

function FormattedMessage({ text }: { text: string }) {
  const cleanedText = text
    .replace(/```json[\s\S]*?```/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/---/g, "")
    .replace(/([.!?])\s+(\*\*\d+\.)/g, "$1\n\n$2")
    .replace(/\s+\*\s+(\*\*)/g, "\n\n• $1")
    .replace(/\s+-\s+(\*\*)/g, "\n\n• $1");

  const lines = cleanedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const subItems = line
          .split(/(?=\*\*\d+\.)|\s+\*\s+(?=\*\*)/)
          .map((s) => s.trim())
          .filter(Boolean);

        return (
          <div key={idx} className="space-y-1.5">
            {subItems.map((sub, sIdx) => {
              const isNumberedHeader = /^\*\*\d+\./.test(sub);
              const isBullet =
                sub.startsWith("* ") ||
                sub.startsWith("- ") ||
                sub.startsWith("• ");

              const cleanSub = sub.replace(/^[*•–-\s]+/, "");

              return (
                <p
                  key={sIdx}
                  className={
                    isNumberedHeader
                      ? "font-bold text-foreground mt-3 mb-1"
                      : isBullet
                        ? "pl-3 flex items-start gap-2 font-medium"
                        : "font-normal"
                  }
                >
                  {isBullet && (
                    <span className="text-primary mt-1">•</span>
                  )}

                  <span className="flex-1">
                    {cleanSub
                      .split(/(\*\*[^*]+\*\*)/g)
                      .map((part, i) =>
                        part.startsWith("**") &&
                        part.endsWith("**") ? (
                          <strong
                            key={i}
                            className="text-primary font-semibold"
                          >
                            {part.slice(2, -2)}
                          </strong>
                        ) : (
                          <span key={i}>{part}</span>
                        ),
                      )}
                  </span>
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// TYPES
// ============================================================

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

type PendingUpdate = {
  profile: Record<string, any>;
  explanation: string;
};

// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(): string {
  const plan = getPlan();

  // WeakMap keeps this cheap when the exact same object is reused.
  const cached = systemPromptCache.get(plan as object);
  if (cached) return cached;

  const currentProfile = JSON.stringify(plan);

  const prompt = `You are the ${APP_NAME} performance coach.

You are helping the athlete recalibrate their existing roadmap.

The protocol below is the live engine state. Every phase, block, start/end date,
daily target and habit in it drives the app directly, so any structural change
must be expressed as an edit to this object.

Your job is NOT to blindly obey requests.

You are a coach collaborating with the athlete.

CURRENT PROTOCOL:
${currentProfile}

============================================================
CORE BEHAVIOUR
============================================================

When the athlete asks to change something, first discuss WHY.

Do not automatically change calories because the athlete says they gained weight.

Do not automatically change steps because the athlete says progress is slow.

Do not automatically change dates because the athlete asks for them.

Instead:

1. Understand the actual problem.
2. Consider the relevant evidence and current protocol.
3. Identify what should actually change.
4. Explain the reasoning clearly.
5. Propose a specific change.
6. Ask the athlete to explicitly confirm it.

Do NOT generate JSON until the athlete explicitly confirms.

Explicit confirmation examples:

"Yes"
"Do it"
"Apply that"
"Sounds good"
"Go ahead"
"Make that change"

If the athlete has NOT confirmed, continue normally.

============================================================
IMPORTANT
============================================================

The athlete is allowed to disagree.

If they disagree, discuss the alternative rather than immediately applying it.

============================================================
FINAL JSON
============================================================

ONLY after explicit confirmation output the complete updated protocol.

The updated protocol MUST:

- Maintain the exact same JSON schema.
- Preserve existing information unless explicitly changed.
- Keep phase and block dates in YYYY-MM-DD form.
- Keep dates contiguous and in order.
- When pausing or shifting the plan, offset affected block dates.
- Preserve unrelated values.
- Keep habits as daily actionable behaviours.
- Keep dailyTargets fully populated.
- Keep the roadmap structure intact unless explicitly changed.

When producing the final update:

1. Briefly state what was agreed.
2. Immediately output the COMPLETE updated JSON object inside:

\`\`\`json
{
  ...
}
\`\`\`

Do not modify localStorage. The application handles saving.

============================================================
FORMATTING
============================================================

Keep normal coaching responses conversational and easy to read.

Use blank lines between sections.

Do not squash numbered points together.

Do not output JSON unless the athlete explicitly confirmed the proposed change.`;

  systemPromptCache.set(plan as object, prompt);

  return prompt;
}

// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();

  const timeout = window.setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

// ============================================================
// MODEL COOLDOWN
// ============================================================

function isCoolingDown(model: string): boolean {
  const expires = modelCooldowns.get(model);

  if (!expires) return false;

  if (Date.now() >= expires) {
    modelCooldowns.delete(model);
    return false;
  }

  return true;
}

function cooldown(model: string) {
  modelCooldowns.set(model, Date.now() + MODEL_COOLDOWN_MS);
}

// ============================================================
// GEMINI REQUEST
// ============================================================

async function callGemini(
  apiKey: string,
  messages: ChatMessage[],
): Promise<string> {
  const contents = messages.slice(-8).map((message) => ({
    role: message.role,
    parts: [{ text: message.text }],
  }));

  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: buildSystemPrompt() }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
    },
  });

  let lastError = "Gemini request failed.";

  for (const model of MODELS) {
    if (isCoolingDown(model)) continue;

    try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body,
        },
        MODEL_TIMEOUT_MS,
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const reply =
          data.candidates?.[0]?.content?.parts
            ?.map((part: any) =>
              typeof part?.text === "string"
                ? part.text
                : "",
            )
            .join("")
            .trim() || "";

        if (reply) {
          return reply;
        }

        lastError = `${model} returned an empty response.`;
        continue;
      }

      lastError =
        data.error?.message ||
        `HTTP ${response.status} from ${model}`;

      if (response.status === 401 || response.status === 403) {
        throw new Error(lastError);
      }

      if (response.status === 429) {
        cooldown(model);
        continue;
      }

      continue;
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        lastError = `${model} timed out.`;
        continue;
      }

      if (error instanceof Error) {
        lastError = error.message;

        if (
          error.message.includes("API key") ||
          error.message.includes("401") ||
          error.message.includes("403")
        ) {
          throw error;
        }
      }

      continue;
    }
  }

  throw new Error(
    `All Gemini models failed. ${lastError}`,
  );
}

// ============================================================
// COMPONENT
// ============================================================

export function RecalibrateModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pendingUpdate, setPendingUpdate] =
    useState<PendingUpdate | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  // ============================================================
  // AUTO SCROLL
  // ============================================================

  useEffect(() => {
    if (!isOpen) return;

    const el = scrollRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [
    isOpen,
    messages.length,
    isTyping,
    pendingUpdate,
  ]);

  // ============================================================
  // INPUT
  // ============================================================

  const resetTextarea = useCallback(() => {
    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, []);

  const handleInputResize = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;

      setInput(value);

      e.target.style.height = "auto";
      e.target.style.height =
        `${Math.min(e.target.scrollHeight, 120)}px`;
    },
    [],
  );

  // ============================================================
  // OPEN / CLOSE
  // ============================================================

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);

      if (open && messages.length === 0) {
        setMessages([
          {
            role: "model",
            text:
              "Coach online. What are we recalibrating today?",
          },
          {
            role: "model",
            text:
              "Remember... this recalibrate function is for legitimate plan updates only. Don't change the protocol just because you're struggling with it.",
          },
        ]);
      }

      if (!open) {
        setPendingUpdate(null);
        resetTextarea();
      }
    },
    [messages.length, resetTextarea],
  );

  // ============================================================
  // SEND
  // ============================================================

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();

      if (
        !trimmed ||
        isTyping ||
        pendingUpdate
      ) {
        return;
      }

      const apiKey =
        localStorage.getItem("p35_gemini_api_key") ||
        "";

      if (!apiKey) {
        toast.error("Gemini API key missing.");
        return;
      }

      const userMessage: ChatMessage = {
        role: "user",
        text: trimmed,
      };

      const nextMessages = [
        ...messages,
        userMessage,
      ];

      setMessages(nextMessages);
      resetTextarea();
      setIsTyping(true);

      try {
        const reply = await callGemini(
          apiKey,
          nextMessages,
        );

        const jsonMatch = reply.match(
          /```json\s*([\s\S]*?)```/,
        );

        if (jsonMatch) {
          try {
            const updatedProfile =
              JSON.parse(
                (jsonMatch[1] ?? "").trim(),
              );

            const explanation = reply
              .replace(
                /```json\s*[\s\S]*?```/g,
                "",
              )
              .trim();

            setPendingUpdate({
              profile: updatedProfile,
              explanation:
                explanation ||
                "The agreed protocol changes are ready for review.",
            });

            setMessages([
              ...nextMessages,
              {
                role: "model",
                text:
                  "I've got the agreed changes ready. Review them below before applying anything.",
              },
            ]);

            return;
          } catch (error) {
            console.error(
              "Failed to parse AI JSON",
              error,
              reply,
            );

            toast.error(
              "The coach generated invalid protocol data. Ask it to try again.",
            );

            return;
          }
        }

        setMessages([
          ...nextMessages,
          {
            role: "model",
            text: reply,
          },
        ]);
      } catch (error) {
        console.error(
          "Gemini request failed:",
          error,
        );

        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to connect to Coach.",
        );
      } finally {
        setIsTyping(false);
      }
    },
    [
      messages,
      isTyping,
      pendingUpdate,
      resetTextarea,
    ],
  );

  // ============================================================
  // APPLY
  // ============================================================

  const applyPendingUpdate = useCallback(() => {
    if (!pendingUpdate) return;

    try {
      savePlan({
        ...getPlan(),
        ...(pendingUpdate.profile as Partial<PlanState>),
      } as PlanState);

      toast.success(
        "Protocol Recalibrated. Reloading Command Centre.",
      );

      setPendingUpdate(null);
      setIsOpen(false);

      window.setTimeout(() => {
        window.location.reload();
      }, 250);
    } catch (error) {
      console.error(
        "Failed to save protocol",
        error,
      );

      toast.error(
        "Could not save the protocol changes.",
      );
    }
  }, [pendingUpdate]);

  // ============================================================
  // CANCEL
  // ============================================================

  const cancelPendingUpdate = useCallback(() => {
    setPendingUpdate(null);

    setMessages((current) => [
      ...current,
      {
        role: "model",
        text:
          "No changes applied. The existing protocol remains untouched. What would you like to reconsider?",
      },
    ]);
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Dialog
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
        >
          <Settings2 className="size-4" />
          Recalibrate Plan
        </Button>
      </DialogTrigger>

      <DialogContent
        className="
          w-[95vw]
          max-w-lg
          h-[100dvh]
          max-h-[100dvh]
          sm:h-[90dvh]
          sm:max-h-[90dvh]
          flex
          flex-col
          overflow-hidden
          p-0
          gap-0
        "
      >
        <DialogHeader className="shrink-0 px-4 pt-5 pb-4 pr-12 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Settings2 className="size-5" />
            AI Protocol Recalibration
          </DialogTitle>

          <DialogDescription>
            Collaborate with your coach before making any changes to the protocol.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="
            flex-1
            min-h-0
            overflow-y-auto
            overscroll-contain
            space-y-4
            px-4
            py-4
          "
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${
                message.role === "user"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`
                  max-w-[85%]
                  rounded-xl
                  px-4
                  py-3
                  text-sm
                  ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2/60 text-foreground"
                  }
                `}
              >
                {message.role === "model" ? (
                  <FormattedMessage
                    text={message.text}
                  />
                ) : (
                  message.text
                )}
              </div>
            </div>
          ))}

          {pendingUpdate && (
            <div className="rounded-lg border border-primary/30 bg-surface-2/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-primary" />

                <p className="text-sm font-semibold">
                  Protocol change ready
                </p>
              </div>

              <div className="text-sm text-muted-foreground leading-relaxed">
                <FormattedMessage
                  text={pendingUpdate.explanation}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={cancelPendingUpdate}
                >
                  <X className="size-4 mr-1.5" />
                  Don't Apply
                </Button>

                <Button
                  size="sm"
                  className="flex-1"
                  onClick={applyPendingUpdate}
                >
                  <Check className="size-4 mr-1.5" />
                  Apply Changes
                </Button>
              </div>
            </div>
          )}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-surface-2/60 text-muted-foreground rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Coach is analyzing...
              </div>
            </div>
          )}
        </div>

        <DialogFooter
          className="
            shrink-0
            p-0
            border-t
            border-border/40
          "
        >
          <div className="w-full pt-2 pb-4 px-4">
            <div
              className="
                flex
                items-end
                gap-2
                bg-surface-2/50
                border
                border-border
                rounded-xl
                p-2
                focus-within:border-primary
                transition-colors
              "
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                disabled={
                  isTyping ||
                  !!pendingUpdate
                }
                onChange={handleInputResize}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey
                  ) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder={
                  pendingUpdate
                    ? "Apply or discard the proposed change above..."
                    : "Reply to coach (e.g. tweak calories, adjust phase)..."
                }
                className="
                  flex-1
                  resize-none
                  bg-transparent
                  text-sm
                  text-foreground
                  placeholder:text-muted-foreground/50
                  focus:outline-none
                  max-h-32
                  py-1.5
                  px-2
                  leading-relaxed
                  disabled:opacity-50
                "
              />

              <Button
                size="icon"
                className="size-9 shrink-0 mb-0.5 rounded-lg"
                onClick={() =>
                  void sendMessage(input)
                }
                disabled={
                  !input.trim() ||
                  isTyping ||
                  !!pendingUpdate
                }
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

