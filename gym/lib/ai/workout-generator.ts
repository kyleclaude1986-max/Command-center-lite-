import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "../db/client";
import { planGenerations } from "../db/schema";
import type { Exercise, WorkoutPlan, WorkoutSubtype, WorkoutType } from "../db/schema";
import { env } from "../env";
import {
  generateFallback,
  lastTopSetFor,
  libraryFor,
  muscleGroupsForPlan,
  recentHistoryFor,
  writeGeneratedPlan,
  type GeneratedExercise,
} from "../planning";

const MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;

const WorkoutSchema = z.object({
  exercises: z.array(
    z.object({
      exerciseId: z.number().int(),
      note: z.string().nullable(),
      sets: z.array(
        z.object({
          targetReps: z.number().int(),
          targetWeightLb: z.number().nullable(),
          isWarmup: z.boolean(),
        })
      ),
    })
  ),
  summary: z.string(),
});

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

/**
 * Passed straight to output_config.format so the API constrains the shape. The SDK's
 * zodOutputFormat helper targets Zod v4 and this project is on v3, so the schema is
 * written out here and the parsed result is checked against WorkoutSchema locally.
 */
const WORKOUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    exercises: {
      type: "array",
      description: "The session, in the order it should be performed.",
      items: {
        type: "object",
        properties: {
          exerciseId: {
            type: "integer",
            description: "Must be an exerciseId from the library in the prompt.",
          },
          note: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description: "Short cue, or null. Never a description of how to perform the movement.",
          },
          sets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                targetReps: { type: "integer" },
                targetWeightLb: {
                  ...nullableNumber,
                  description: "Null when there is no history for this movement.",
                },
                isWarmup: { type: "boolean" },
              },
              required: ["targetReps", "targetWeightLb", "isWarmup"],
              additionalProperties: false,
            },
          },
        },
        required: ["exerciseId", "note", "sets"],
        additionalProperties: false,
      },
    },
    summary: { type: "string", description: "One sentence on the shape of the session." },
  },
  required: ["exercises", "summary"],
  additionalProperties: false,
} as const;

export type GenerationOutcome = {
  source: "claude" | "fallback";
  exercises: GeneratedExercise[];
  summary: string | null;
  error: string | null;
};

const SYSTEM = `You build single strength-training sessions for one lifter.

Rules that matter more than anything else:
- Pick exercises ONLY from the library given to you, by their exerciseId. Never invent
  an id, and never suggest a movement that isn't in the library — the library is the
  equipment and movements this lifter actually has.
- Return exactly the number of exercises requested.
- Respect the requested rep range on working sets.
- Order the session so the heaviest compound work comes first and isolation work last.
- Vary from the recent sessions you are shown. Repeating the same five movements every
  week is the failure mode to avoid, but keep the main compound lift when dropping it
  would make the session incoherent.
- Set targetWeightLb from the lifter's history when there is history for that movement,
  progressing modestly when the last session was rated well. Use null when there is no
  history — do not guess a number for a movement they have never logged.
- Warmup sets are optional. Include them only for heavy compound movements.

Keep notes short and useful — a cue, a tempo, a reason for the pairing. Never write a
description of how to perform the exercise.`;

function buildPrompt(
  plan: WorkoutPlan,
  type: WorkoutType,
  subtype: WorkoutSubtype | null,
  library: Exercise[]
): string {
  const history = recentHistoryFor(plan.workoutTypeId, plan.workoutSubtypeId);

  const libraryLines = library
    .map((exercise) => {
      const last = lastTopSetFor(exercise.id);
      const suffix = last?.weightLb
        ? ` — last top set ${last.reps ?? "?"} x ${last.weightLb} lb`
        : " — no history";
      return `  ${exercise.id}: ${exercise.name}${suffix}`;
    })
    .join("\n");

  const historyBlock =
    history.length === 0
      ? "  No previous sessions of this kind."
      : history
          .map((session) => {
            const rating = session.rating === null ? "unrated" : `rated ${session.rating}/5`;
            const moves = session.exercises
              .map((e) =>
                e.topSet?.weightLb
                  ? `${e.name} ${e.topSet.reps ?? "?"}x${e.topSet.weightLb}lb`
                  : e.name
              )
              .join(", ");
            return `  ${session.performedOn} (${rating}): ${moves || "no exercises logged"}`;
          })
          .join("\n");

  const dayName = subtype ? `${type.name} — ${subtype.name}` : type.name;

  return `Build one session.

Day: ${dayName}
Date: ${plan.plannedOn}
Exercises required: ${plan.exerciseCount}
Working rep range: ${plan.targetRepsLow}-${plan.targetRepsHigh}
Rest between sets: ${plan.restSeconds} seconds

Exercise library (pick only from these):
${libraryLines}

Recent sessions of this kind, newest first:
${historyBlock}`;
}

export function validate(
  parsed: z.infer<typeof WorkoutSchema>,
  library: Exercise[],
  requested: number
): { exercises: GeneratedExercise[] } | { error: string } {
  const allowed = new Set(library.map((e) => e.id));

  const unknown = parsed.exercises
    .map((e) => e.exerciseId)
    .filter((id) => !allowed.has(id));
  if (unknown.length > 0) {
    return { error: `not in the library: ${[...new Set(unknown)].join(", ")}` };
  }

  const withSets = parsed.exercises.filter((e) => e.sets.length > 0);
  if (withSets.length === 0) return { error: "no exercises with sets" };

  const seen = new Set<number>();
  const deduped = withSets.filter((e) => {
    if (seen.has(e.exerciseId)) return false;
    seen.add(e.exerciseId);
    return true;
  });

  return {
    exercises: deduped.slice(0, requested).map((entry) => ({
      exerciseId: entry.exerciseId,
      note: entry.note,
      sets: entry.sets.map((set) => ({
        targetReps: set.targetReps,
        targetWeightLb: set.targetWeightLb,
        isWarmup: set.isWarmup,
      })),
    })),
  };
}

async function askClaude(
  client: Anthropic,
  prompt: string,
  library: Exercise[],
  requested: number
): Promise<
  | { ok: true; exercises: GeneratedExercise[]; summary: string; usage: Anthropic.Usage; raw: string }
  | { ok: false; error: string; usage: Anthropic.Usage | null; raw: string | null }
> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: WORKOUT_JSON_SCHEMA },
    },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    return { ok: false, error: "model declined the request", usage: response.usage, raw: null };
  }

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!raw.trim()) {
    return { ok: false, error: "empty response", usage: response.usage, raw: null };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "response was not valid JSON", usage: response.usage, raw };
  }

  const parsed = WorkoutSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `response did not match the schema: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      usage: response.usage,
      raw,
    };
  }

  const checked = validate(parsed.data, library, requested);
  if ("error" in checked) {
    return { ok: false, error: checked.error, usage: response.usage, raw };
  }

  return {
    ok: true,
    exercises: checked.exercises,
    summary: parsed.data.summary,
    usage: response.usage,
    raw,
  };
}

export async function generateWorkout(
  plan: WorkoutPlan,
  type: WorkoutType,
  subtype: WorkoutSubtype | null
): Promise<GenerationOutcome> {
  const library = libraryFor(muscleGroupsForPlan(type, subtype));

  function fallback(error: string | null): GenerationOutcome {
    const exercises = generateFallback(plan, type, subtype);
    writeGeneratedPlan(plan.id, exercises, "fallback");
    db.insert(planGenerations)
      .values({ planId: plan.id, source: "fallback", error })
      .run();
    return { source: "fallback", exercises, summary: null, error };
  }

  if (library.length === 0) {
    return fallback("no exercises in the library for this day");
  }

  if (!env.ANTHROPIC_API_KEY) {
    return fallback(null);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const basePrompt = buildPrompt(plan, type, subtype, library);
  let prompt = basePrompt;
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await askClaude(client, prompt, library, plan.exerciseCount);

      if (result.ok) {
        writeGeneratedPlan(plan.id, result.exercises, "claude");
        db.insert(planGenerations)
          .values({
            planId: plan.id,
            source: "claude",
            model: MODEL,
            inputTokens: result.usage.input_tokens,
            outputTokens: result.usage.output_tokens,
            prompt,
            response: result.raw,
          })
          .run();
        return {
          source: "claude",
          exercises: result.exercises,
          summary: result.summary,
          error: null,
        };
      }

      lastError = result.error;
      db.insert(planGenerations)
        .values({
          planId: plan.id,
          source: "claude",
          model: MODEL,
          inputTokens: result.usage?.input_tokens ?? null,
          outputTokens: result.usage?.output_tokens ?? null,
          prompt,
          response: result.raw,
          error: result.error,
        })
        .run();

      prompt = `${basePrompt}

Your previous attempt was rejected: ${result.error}. Every exerciseId must appear in
the library above, and you must return exactly ${plan.exerciseCount} exercises.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      db.insert(planGenerations)
        .values({ planId: plan.id, source: "claude", model: MODEL, prompt, error: lastError })
        .run();
      break;
    }
  }

  return fallback(lastError || "generation failed");
}
