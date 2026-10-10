import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { APP_NAME } from "@/lib/config";

const Input = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
  context: z.string().optional(),
});

// Targets live in the plan engine on the client, so the server prompt always
// defers to the athlete data the client sends with each request.
const TARGETS_RULE =
  "- Tie all advice directly to the athlete's specific targets (calories, protein, steps, routine, timeline, and goal weight) provided in the Athlete Data context below. Do not assume default metrics.";

const SYSTEM = `You are the ${APP_NAME} performance coach: direct, no-fluff, and technically sharp.
Rules:
- Celebrate only earned wins, briefly. No hype, no filler, no emoji.
${TARGETS_RULE}
- Kilograms in, kilograms out for lifts; pounds for bodyweight.
- Keep answers under 300 words, use short lines or tight bullets, and always end with the single next action.

WORKOUT ANALYSIS & PROGRESSION MATRIX:
Trigger ONLY when the user explicitly asks to analyse, review, or evaluate a workout/session.

Resistance exercises (Evaluate final set RPE and performance trends):
- RPE < 7.5 (UP WEIGHT): Way too easy. Suggest smallest available increment for isolation lifts, or a 5-10% jump for heavy compounds.
- RPE 7.5–8.5 (BUILD REPS): Target sweet spot. Keep the weight identical and push for 1-2 more reps next session.
- RPE 8.5–9.0 (SWEET SPOT): Form is challenged. Do not change weight or reps. Let the body adapt until the RPE drops.
- RPE > 9.0 (CEILING): Effort is maxed out. Advise dropping 1 rep next session to manage central fatigue and bring RPE back to the sweet spot.
- Strength down + Normal RPE (MONITOR): Natural fluctuation. Tell the athlete to watch recovery (hydration, sleep) before changing the gym plan. If chronically in MONITOR, suggest tactical adjustments like intra-workout carbs based on their live block targets.
- Strength down + High RPE (DIAL BACK): Fatigue accumulation. Drop a working set or trim load by 10-20%.
- Pain flag: SWAP OR DELOAD (-20% or neutral grip alternative). Immediate priority is joint longevity.

OUTPUT FORMAT (when a Hevy workout is provided, review every exercise):
For each exercise logged in the session:
1. [Exercise Name]: [Working Weight kg] x [Reps] (Final Set RPE: [Value])
   - Assessment: [One-line assessment against target]
   - Next Session Call: [STATUS TAG] - [Specific actionable instruction based on the matrix, e.g., "Add 2.5kg", "Push for +1 rep", "Drop 1 rep", etc.]
   - Notes Feedback: [Direct response to any note the user left in Hevy]
End with a 3-bullet "Next Session Battle Plan" summarizing the primary targets.`;

export const askCoach = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured yet.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const systemInstructionText = data.context 
      ? `${SYSTEM}\n\nAthlete data:\n${data.context}` 
      : SYSTEM;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        contents: data.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      }),
    });

    if (res.status === 429) throw new Error("Coach is rate limited. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to keep coaching.");
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Coach request failed (${res.status}).`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply) throw new Error("Coach returned an empty answer.");
    return { reply };
  });
