import { db } from "./db/client";
import {
  exercises,
  goals,
  recoveryTypes,
  supplements,
  supplementSlots,
  vacations,
  workoutSubtypes,
  workoutTypes,
} from "./db/schema";
import {
  countRecoveryForType,
  countSupplementLogs,
  countSupplementsInSlot,
  countTypesForGoal,
  countWorkoutsForExercise,
  countWorkoutsForType,
} from "./admin-entities";
import { parseDays } from "./supplements";
import type { AdminItem } from "@/components/admin/AdminList";
import { fmtDuration, pluralize } from "./format";
import { fmtIsoDay } from "./dates";

function impact(used: number, label: string): string | undefined {
  if (used === 0) return "Nothing is using it.";
  return `This is used by ${used} ${pluralize(used, label)}, so deleting is blocked. Archive it instead.`;
}

export function goalItems(): AdminItem[] {
  return db
    .select()
    .from(goals)
    .orderBy(goals.position)
    .all()
    .map((goal) => ({
      id: goal.id,
      label: goal.name,
      sublabel: [
        `${goal.targetDaysPerWeek} ${pluralize(goal.targetDaysPerWeek, "day")} a week`,
        goal.minDurationSec ? `at least ${fmtDuration(goal.minDurationSec)}` : null,
        `${countTypesForGoal(goal.id)} types feed it`,
      ]
        .filter(Boolean)
        .join(" · "),
      archived: goal.archivedAt !== null,
      deleteImpact:
        countTypesForGoal(goal.id) > 0
          ? "Workout and recovery types pointing at it will stop counting toward anything."
          : "Nothing is using it.",
      values: {
        name: goal.name,
        targetDaysPerWeek: goal.targetDaysPerWeek,
        minDurationMinutes: goal.minDurationSec ? Math.round(goal.minDurationSec / 60) : "",
        position: goal.position,
      },
    }));
}

export function workoutTypeItems(): AdminItem[] {
  const allGoals = db.select().from(goals).all();
  const goalById = new Map(allGoals.map((g) => [g.id, g]));

  return db
    .select()
    .from(workoutTypes)
    .orderBy(workoutTypes.position)
    .all()
    .map((type) => {
      const used = countWorkoutsForType(type.id);
      return {
        id: type.id,
        label: type.name,
        color: type.color,
        sublabel: [
          type.goalId ? (goalById.get(type.goalId)?.name ?? "No goal") : "Counts toward nothing",
          type.hasSubtypes ? "has sub-days" : null,
          `${used} logged`,
        ]
          .filter(Boolean)
          .join(" · "),
        archived: type.archivedAt !== null,
        deleteImpact: impact(used, "logged workout"),
        values: {
          name: type.name,
          goalId: type.goalId ?? "",
          hasSubtypes: type.hasSubtypes,
          color: type.color,
          position: type.position,
        },
      };
    });
}

export function workoutSubtypeItems(): AdminItem[] {
  const types = db.select().from(workoutTypes).all();
  const typeById = new Map(types.map((t) => [t.id, t]));

  return db
    .select()
    .from(workoutSubtypes)
    .orderBy(workoutSubtypes.workoutTypeId, workoutSubtypes.position)
    .all()
    .map((subtype) => ({
      id: subtype.id,
      label: subtype.name,
      color: typeById.get(subtype.workoutTypeId)?.color,
      sublabel: typeById.get(subtype.workoutTypeId)?.name ?? "Orphaned",
      archived: subtype.archivedAt !== null,
      deleteImpact: "Workouts logged against it keep their type but lose the sub-day.",
      values: {
        name: subtype.name,
        workoutTypeId: subtype.workoutTypeId,
        position: subtype.position,
      },
    }));
}

export function recoveryTypeItems(): AdminItem[] {
  const allGoals = db.select().from(goals).all();
  const goalById = new Map(allGoals.map((g) => [g.id, g]));

  return db
    .select()
    .from(recoveryTypes)
    .orderBy(recoveryTypes.position)
    .all()
    .map((type) => {
      const used = countRecoveryForType(type.id);
      return {
        id: type.id,
        label: type.name,
        color: type.color,
        sublabel: [
          type.goalId ? (goalById.get(type.goalId)?.name ?? "No goal") : "Counts toward nothing",
          `${used} logged`,
        ].join(" · "),
        archived: type.archivedAt !== null,
        deleteImpact: impact(used, "logged recovery day"),
        values: {
          name: type.name,
          goalId: type.goalId ?? "",
          color: type.color,
          position: type.position,
        },
      };
    });
}

export function vacationItems(): AdminItem[] {
  return db
    .select()
    .from(vacations)
    .orderBy(vacations.startsOn)
    .all()
    .map((vacation) => ({
      id: vacation.id,
      label: vacation.label ?? "Vacation",
      sublabel: `${fmtIsoDay(vacation.startsOn)} to ${fmtIsoDay(vacation.endsOn)}`,
      deleteImpact: "Those weeks go back to their full targets.",
      values: {
        label: vacation.label ?? "",
        startsOn: vacation.startsOn,
        endsOn: vacation.endsOn,
      },
    }));
}

export function exerciseItems(): AdminItem[] {
  return db
    .select()
    .from(exercises)
    .orderBy(exercises.muscleGroup, exercises.name)
    .all()
    .map((exercise) => {
      const used = countWorkoutsForExercise(exercise.id);
      return {
        id: exercise.id,
        label: exercise.name,
        sublabel: [
          exercise.muscleGroup.replace("_", " and "),
          exercise.isCustom ? "custom" : null,
          `${used} logged`,
        ]
          .filter(Boolean)
          .join(" · "),
        archived: exercise.archivedAt !== null,
        deleteImpact: impact(used, "logged workout"),
        values: {
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
        },
      };
    });
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function scheduleLabel(supplement: typeof supplements.$inferSelect): string {
  switch (supplement.scheduleKind) {
    case "daily":
      return "every day";
    case "weekdays": {
      const days = parseDays(supplement.scheduleDays);
      if (days.length === 0) return "no days set";
      if (days.length === 7) return "every day";
      return days.map((d) => DAY_NAMES[d - 1]).join(", ");
    }
    case "workout_days":
      return "workout days";
    case "interval":
      return supplement.intervalDays === 1
        ? "every day"
        : `every ${supplement.intervalDays ?? "?"} days`;
    default:
      return "";
  }
}

export function supplementSlotItems(): AdminItem[] {
  return db
    .select()
    .from(supplementSlots)
    .orderBy(supplementSlots.position)
    .all()
    .map((slot) => {
      const used = countSupplementsInSlot(slot.id);
      return {
        id: slot.id,
        label: slot.name,
        sublabel: `${used} ${pluralize(used, "supplement")}`,
        archived: slot.archivedAt !== null,
        deleteImpact:
          used > 0
            ? `Blocked while ${used} ${pluralize(used, "supplement")} still ${used === 1 ? "uses" : "use"} it.`
            : "Nothing is using it.",
        values: { name: slot.name, position: slot.position },
      };
    });
}

export function supplementItems(): AdminItem[] {
  const slots = db.select().from(supplementSlots).all();
  const slotById = new Map(slots.map((s) => [s.id, s]));

  return db
    .select()
    .from(supplements)
    .orderBy(supplements.position, supplements.name)
    .all()
    .map((supplement) => {
      const used = countSupplementLogs(supplement.id);
      const dose =
        supplement.dose === null
          ? null
          : `${Number.isInteger(supplement.dose) ? supplement.dose : supplement.dose.toFixed(1)} ${supplement.unit}`;
      return {
        id: supplement.id,
        label: supplement.name,
        sublabel: [
          slotById.get(supplement.slotId)?.name ?? "No slot",
          dose,
          scheduleLabel(supplement),
          `${used} logged`,
        ]
          .filter(Boolean)
          .join(" · "),
        archived: supplement.archivedAt !== null,
        deleteImpact:
          used > 0
            ? `Blocked while ${used} logged ${pluralize(used, "day")} reference it. Archive instead.`
            : "Nothing is using it.",
        values: {
          name: supplement.name,
          slotId: supplement.slotId,
          dose: supplement.dose,
          unit: supplement.unit,
          scheduleKind: supplement.scheduleKind,
          scheduleDays: parseDays(supplement.scheduleDays).join(","),
          intervalDays: supplement.intervalDays,
          startsOn: supplement.startsOn,
          position: supplement.position,
        },
      };
    });
}

export function supplementSlotOptions() {
  return db
    .select()
    .from(supplementSlots)
    .orderBy(supplementSlots.position)
    .all()
    .map((slot) => ({ value: String(slot.id), label: slot.name }));
}

export function goalOptions(includeNone = true) {
  const options = db
    .select()
    .from(goals)
    .orderBy(goals.position)
    .all()
    .map((goal) => ({ value: String(goal.id), label: goal.name }));
  return includeNone ? [{ value: "", label: "Counts toward nothing" }, ...options] : options;
}

export function workoutTypeOptions() {
  return db
    .select()
    .from(workoutTypes)
    .orderBy(workoutTypes.position)
    .all()
    .map((type) => ({ value: String(type.id), label: type.name }));
}
