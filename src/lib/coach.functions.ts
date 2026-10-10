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

PROGRESSION & FATIGUE MATRIX (Evaluate final set RPE and weight/rep trends):
- RPE < 7.5: INCREASE (+ load or + rep). There is room to push; load is too light.
- RPE 7.5–9.0: ON TRACK. Target sweet spot. Consolidate current load and progress reps.
- RPE > 9.0 (or effort significantly higher than historical baseline): HOLD. Working near failure. Hold load, do not promote.
- Performance dipping + High RPE (>9.0): DIAL BACK. Fatigue is accumulating. Drop a set or trim the load.
- Performance dipping + Normal/Low RPE: WATCH. Strength is dipping but effort isn't spiking. Flag sleep/food/form before cutting volume.
- Pain / Joint Discomfort Flag: SWAP OR DELOAD (-20% load or neutral grip). Immediate priority is joint longevity.

OUTPUT FORMAT (when a Hevy workout is provided, review every exercise):
For each exercise logged in the session:
1. [Exercise Name]: [Working Weight kg] x [Reps] (Final Set RPE: [Value])
   - Assessment: [One-line assessment against target]
   - Next Session Call: [INCREASE | ON TRACK | HOLD | WATCH | DIAL BACK | SWAP]
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
