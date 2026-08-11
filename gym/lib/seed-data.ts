import type { MuscleGroup } from "./db/schema";

export const SEED_GOALS = [
  { slug: "gym", name: "Gym", targetDaysPerWeek: 5, minDurationSec: null, position: 0 },
  { slug: "cardio", name: "Cardio", targetDaysPerWeek: 1, minDurationSec: 1500, position: 1 },
];

export const SEED_WORKOUT_TYPES = [
  {
    slug: "ithinkfit-gym-fit-camp",
    name: "iThinkFit Gym Fit Camp",
    goalSlug: "gym",
    color: "#1e6091",
    position: 0,
    subtypes: [] as string[],
  },
  {
    slug: "ithinkfit-olympus",
    name: "iThinkFit Olympus",
    goalSlug: "gym",
    color: "#2a7f7f",
    position: 1,
    subtypes: [],
  },
  {
    slug: "west-o-strength",
    name: "West O Strength",
    goalSlug: "gym",
    color: "#4a7c59",
    position: 2,
    subtypes: ["Back", "Chest", "Legs", "Shoulders", "Abs and Calves"],
  },
  {
    slug: "walking",
    name: "Walking",
    goalSlug: "cardio",
    color: "#a8762c",
    position: 3,
    subtypes: [],
  },
  {
    slug: "running",
    name: "Running",
    goalSlug: "cardio",
    color: "#c97b63",
    position: 4,
    subtypes: [],
  },
  {
    slug: "walking-weighted-vest",
    name: "Walking — Weighted Vest",
    goalSlug: "cardio",
    color: "#a4553a",
    position: 5,
    subtypes: [],
  },
  {
    slug: "running-weighted-vest",
    name: "Running — Weighted Vest",
    goalSlug: "cardio",
    color: "#8a5a83",
    position: 6,
    subtypes: [],
  },
  {
    slug: "apple-health-import",
    name: "Apple Health import",
    goalSlug: null,
    color: "#566270",
    position: 7,
    subtypes: [],
  },
];

export const APPLE_HEALTH_TYPE_SLUG = "apple-health-import";

export const SEED_RECOVERY_TYPES = [
  { slug: "sauna", name: "Sauna", color: "#a4553a", position: 0 },
  { slug: "red-light-therapy", name: "Red Light Therapy", color: "#c97b63", position: 1 },
];

export const SEED_EXERCISES: { group: MuscleGroup; names: string[] }[] = [
  {
    group: "back",
    names: [
      "Deadlift",
      "Barbell Row",
      "Pull-Up",
      "Chin-Up",
      "Lat Pulldown",
      "Seated Cable Row",
      "T-Bar Row",
      "Single-Arm Dumbbell Row",
      "Straight-Arm Pulldown",
      "Face Pull",
      "Rack Pull",
      "Shrug",
    ],
  },
  {
    group: "chest",
    names: [
      "Barbell Bench Press",
      "Incline Barbell Press",
      "Decline Bench Press",
      "Dumbbell Bench Press",
      "Incline Dumbbell Press",
      "Machine Chest Press",
      "Chest Fly",
      "Cable Crossover",
      "Pec Deck",
      "Dip",
      "Push-Up",
    ],
  },
  {
    group: "legs",
    names: [
      "Back Squat",
      "Front Squat",
      "Hack Squat",
      "Goblet Squat",
      "Leg Press",
      "Romanian Deadlift",
      "Walking Lunge",
      "Bulgarian Split Squat",
      "Step-Up",
      "Leg Extension",
      "Lying Leg Curl",
      "Hip Thrust",
    ],
  },
  {
    group: "shoulders",
    names: [
      "Overhead Press",
      "Seated Dumbbell Press",
      "Arnold Press",
      "Machine Shoulder Press",
      "Landmine Press",
      "Lateral Raise",
      "Cable Lateral Raise",
      "Front Raise",
      "Rear Delt Fly",
      "Upright Row",
    ],
  },
  {
    group: "abs_calves",
    names: [
      "Standing Calf Raise",
      "Seated Calf Raise",
      "Calf Press",
      "Hanging Leg Raise",
      "Cable Crunch",
      "Decline Sit-Up",
      "Ab Wheel",
      "Plank",
      "Russian Twist",
      "Dead Bug",
      "Mountain Climber",
    ],
  },
];

export const SEED_DEFAULT_MACRO_TARGET = {
  calories: 2200,
  proteinG: 180,
  carbsG: 200,
  fatG: 70,
};
