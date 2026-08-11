import { MUSCLE_GROUPS, type MuscleGroup, type PhotoPose } from "./db/schema";

export const POSE_LABELS: Record<PhotoPose, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};

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

export const METRIC_KEYS = ["weightLb", "muscleMassLb", "fatMassLb", "bodyFatPct"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  weightLb: "Weight",
  muscleMassLb: "Muscle",
  fatMassLb: "Fat",
  bodyFatPct: "Body fat",
};

export const METRIC_UNITS: Record<MetricKey, string> = {
  weightLb: "lb",
  muscleMassLb: "lb",
  fatMassLb: "lb",
  bodyFatPct: "%",
};
