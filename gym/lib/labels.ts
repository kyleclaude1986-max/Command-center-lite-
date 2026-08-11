import { MUSCLE_GROUPS, type MuscleGroup } from "./db/schema";

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  back: "Back",
  chest: "Chest",
  legs: "Legs",
  shoulders: "Shoulders",
  abs_calves: "Abs and calves",
  other: "Other",
};

export const MUSCLE_GROUP_OPTIONS = MUSCLE_GROUPS.map((value) => ({
  value,
  label: MUSCLE_GROUP_LABELS[value],
}));
