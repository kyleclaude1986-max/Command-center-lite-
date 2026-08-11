import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

export const MACRO_DIRECTIONS = ["at_least", "at_most", "around"] as const;
export const MUSCLE_GROUPS = ["back", "chest", "legs", "shoulders", "abs_calves", "other"] as const;
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export const PHOTO_POSES = ["front", "side", "back"] as const;
export const CALENDAR_SYNC_STATES = ["pending", "synced", "failed", "skipped"] as const;
export const SUPPLEMENT_SCHEDULES = ["daily", "weekdays", "workout_days", "interval"] as const;
export const SUPPLEMENT_UNITS = ["capsule", "tablet", "scoop", "g", "mg", "mcg", "IU", "ml"] as const;
export const PLAN_STATUSES = ["scheduled", "generated", "completed", "skipped"] as const;
export const PLAN_SOURCES = ["claude", "fallback", "manual"] as const;

export const gymSettings = sqliteTable("gym_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  scannedCalendars: text("scanned_calendars").notNull().default("[]"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  targetDaysPerWeek: integer("target_days_per_week").notNull().default(1),
  minDurationSec: integer("min_duration_sec"),
  position: integer("position").notNull().default(0),
  archivedAt: integer("archived_at"),
  createdAt: integer("created_at").notNull().default(now),
});

export const workoutTypes = sqliteTable(
  "workout_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
    hasSubtypes: integer("has_subtypes", { mode: "boolean" }).notNull().default(false),
    isStrength: integer("is_strength", { mode: "boolean" }).notNull().default(false),
    supportsPlanning: integer("supports_planning", { mode: "boolean" }).notNull().default(false),
    color: text("color").notNull().default("#566270"),
    position: integer("position").notNull().default(0),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byGoal: index("workout_types_goal_idx").on(t.goalId),
  })
);

export const workoutSubtypes = sqliteTable(
  "workout_subtypes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutTypeId: integer("workout_type_id")
      .notNull()
      .references(() => workoutTypes.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    archivedAt: integer("archived_at"),
  },
  (t) => ({
    uniqPerType: uniqueIndex("workout_subtypes_type_slug_idx").on(t.workoutTypeId, t.slug),
  })
);

export const recoveryTypes = sqliteTable("recovery_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
  color: text("color").notNull().default("#b08968"),
  position: integer("position").notNull().default(0),
  archivedAt: integer("archived_at"),
  createdAt: integer("created_at").notNull().default(now),
});

export const vacations = sqliteTable(
  "vacations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    label: text("label"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byStart: index("vacations_starts_on_idx").on(t.startsOn),
  })
);

export const exercises = sqliteTable(
  "exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    muscleGroup: text("muscle_group", { enum: MUSCLE_GROUPS }).notNull().default("other"),
    isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byGroup: index("exercises_muscle_group_idx").on(t.muscleGroup),
  })
);

export const workouts = sqliteTable(
  "workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    performedOn: text("performed_on").notNull(),
    workoutTypeId: integer("workout_type_id")
      .notNull()
      .references(() => workoutTypes.id, { onDelete: "restrict" }),
    workoutSubtypeId: integer("workout_subtype_id").references(() => workoutSubtypes.id, {
      onDelete: "set null",
    }),
    startedAt: integer("started_at"),
    durationSec: integer("duration_sec"),
    durationSource: text("duration_source", { enum: ["manual", "apple_health"] }),
    caloriesKcal: integer("calories_kcal"),
    avgHeartRate: integer("avg_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    rating: integer("rating"),
    notes: text("notes"),
    appleHealthUuid: text("apple_health_uuid").unique(),
    planId: integer("plan_id"),
    sourceScheduledId: integer("source_scheduled_id"),
    calendarUid: text("calendar_uid"),
    calendarHref: text("calendar_href"),
    calendarEtag: text("calendar_etag"),
    calendarSyncState: text("calendar_sync_state", { enum: CALENDAR_SYNC_STATES })
      .notNull()
      .default("pending"),
    calendarSyncError: text("calendar_sync_error"),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    byDate: index("workouts_performed_on_idx").on(t.performedOn),
    byType: index("workouts_type_idx").on(t.workoutTypeId),
    byCalendarState: index("workouts_calendar_state_idx").on(t.calendarSyncState),
  })
);

export const workoutExercises = sqliteTable(
  "workout_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    notes: text("notes"),
  },
  (t) => ({
    byWorkout: index("workout_exercises_workout_idx").on(t.workoutId),
    byExercise: index("workout_exercises_exercise_idx").on(t.exerciseId),
  })
);

export const exerciseSets = sqliteTable(
  "exercise_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutExerciseId: integer("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull().default(1),
    reps: integer("reps"),
    weightLb: real("weight_lb"),
    isWarmup: integer("is_warmup", { mode: "boolean" }).notNull().default(false),
    rpe: real("rpe"),
  },
  (t) => ({
    byWorkoutExercise: index("exercise_sets_workout_exercise_idx").on(t.workoutExerciseId),
  })
);

export const recoveryLog = sqliteTable(
  "recovery_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    performedOn: text("performed_on").notNull(),
    recoveryTypeId: integer("recovery_type_id")
      .notNull()
      .references(() => recoveryTypes.id, { onDelete: "restrict" }),
    workoutId: integer("workout_id").references(() => workouts.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    uniqPerDay: uniqueIndex("recovery_log_day_type_idx").on(t.performedOn, t.recoveryTypeId),
  })
);

export const bodyMetrics = sqliteTable(
  "body_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    measuredOn: text("measured_on").notNull(),
    weightLb: real("weight_lb"),
    muscleMassLb: real("muscle_mass_lb"),
    fatMassLb: real("fat_mass_lb"),
    bodyFatPct: real("body_fat_pct"),
    source: text("source", { enum: ["manual", "apple_health"] }).notNull().default("manual"),
    appleHealthUuid: text("apple_health_uuid").unique(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byDate: index("body_metrics_measured_on_idx").on(t.measuredOn),
  })
);

export const progressPhotos = sqliteTable(
  "progress_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    takenOn: text("taken_on").notNull(),
    pose: text("pose", { enum: PHOTO_POSES }).notNull().default("front"),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull().default("image/jpeg"),
    byteSize: integer("byte_size").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byDate: index("progress_photos_taken_on_idx").on(t.takenOn),
  })
);

export const foods = sqliteTable(
  "foods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: ["off", "usda", "custom"] }).notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    servingName: text("serving_name").notNull().default("100 g"),
    servingGrams: real("serving_grams").notNull().default(100),
    caloriesPer100g: real("calories_per_100g").notNull().default(0),
    proteinPer100g: real("protein_per_100g").notNull().default(0),
    carbsPer100g: real("carbs_per_100g").notNull().default(0),
    fatPer100g: real("fat_per_100g").notNull().default(0),
    fiberPer100g: real("fiber_per_100g"),
    createdAt: integer("created_at").notNull().default(now),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => ({
    uniqSource: uniqueIndex("foods_source_id_idx").on(t.source, t.sourceId),
    byName: index("foods_name_idx").on(t.name),
    byLastUsed: index("foods_last_used_idx").on(t.lastUsedAt),
  })
);

export const foodLogEntries = sqliteTable(
  "food_log_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loggedOn: text("logged_on").notNull(),
    meal: text("meal", { enum: MEALS }).notNull().default("snack"),
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "restrict" }),
    quantity: real("quantity").notNull().default(1),
    servingGramsAtLog: real("serving_grams_at_log").notNull().default(100),
    calories: real("calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byDate: index("food_log_entries_logged_on_idx").on(t.loggedOn),
  })
);

export const savedMeals = sqliteTable("saved_meals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  meal: text("meal", { enum: MEALS }).notNull().default("breakfast"),
  createdAt: integer("created_at").notNull().default(now),
});

export const savedMealItems = sqliteTable(
  "saved_meal_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    savedMealId: integer("saved_meal_id")
      .notNull()
      .references(() => savedMeals.id, { onDelete: "cascade" }),
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "restrict" }),
    quantity: real("quantity").notNull().default(1),
    servingGrams: real("serving_grams").notNull().default(100),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    byMeal: index("saved_meal_items_meal_idx").on(t.savedMealId),
  })
);

export const macroTargets = sqliteTable(
  "macro_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutTypeId: integer("workout_type_id").references(() => workoutTypes.id, {
      onDelete: "cascade",
    }),
    scopeKey: integer("scope_key").notNull(),
    calories: real("calories").notNull().default(2200),
    proteinG: real("protein_g").notNull().default(180),
    carbsG: real("carbs_g").notNull().default(200),
    fatG: real("fat_g").notNull().default(70),
    caloriesDirection: text("calories_direction", { enum: MACRO_DIRECTIONS })
      .notNull()
      .default("at_most"),
    proteinDirection: text("protein_direction", { enum: MACRO_DIRECTIONS })
      .notNull()
      .default("at_least"),
    carbsDirection: text("carbs_direction", { enum: MACRO_DIRECTIONS }).notNull().default("at_most"),
    fatDirection: text("fat_direction", { enum: MACRO_DIRECTIONS }).notNull().default("at_most"),
    tolerancePct: real("tolerance_pct").notNull().default(10),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    uniqScope: uniqueIndex("macro_targets_scope_idx").on(t.scopeKey),
  })
);

export const scheduledWorkouts = sqliteTable(
  "scheduled_workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    calendarName: text("calendar_name").notNull(),
    externalUid: text("external_uid").notNull(),
    title: text("title").notNull(),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at").notNull(),
    scheduledOn: text("scheduled_on").notNull(),
    guessedTypeId: integer("guessed_type_id").references(() => workoutTypes.id, {
      onDelete: "set null",
    }),
    confirmedWorkoutId: integer("confirmed_workout_id").references(() => workouts.id, {
      onDelete: "set null",
    }),
    dismissedAt: integer("dismissed_at"),
    lastSeenAt: integer("last_seen_at").notNull().default(now),
  },
  (t) => ({
    uniqEvent: uniqueIndex("scheduled_workouts_uid_idx").on(
      t.calendarName,
      t.externalUid,
      t.startsAt
    ),
    byDate: index("scheduled_workouts_scheduled_on_idx").on(t.scheduledOn),
  })
);

export const healthIngests = sqliteTable(
  "health_ingests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    receivedAt: integer("received_at").notNull().default(now),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("received"),
    error: text("error"),
    workoutsWritten: integer("workouts_written").notNull().default(0),
    metricsWritten: integer("metrics_written").notNull().default(0),
  },
  (t) => ({
    byReceived: index("health_ingests_received_idx").on(t.receivedAt),
  })
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    startedAt: integer("started_at").notNull().default(now),
    finishedAt: integer("finished_at"),
    status: text("status").notNull().default("running"),
    error: text("error"),
    itemsWritten: integer("items_written").default(0),
  },
  (t) => ({
    bySource: index("sync_runs_source_idx").on(t.source, t.startedAt),
  })
);

export const supplementSlots = sqliteTable("supplement_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  archivedAt: integer("archived_at"),
  createdAt: integer("created_at").notNull().default(now),
});

export const supplements = sqliteTable(
  "supplements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    dose: real("dose"),
    unit: text("unit").notNull().default("capsule"),
    slotId: integer("slot_id")
      .notNull()
      .references(() => supplementSlots.id, { onDelete: "restrict" }),
    scheduleKind: text("schedule_kind", { enum: SUPPLEMENT_SCHEDULES })
      .notNull()
      .default("daily"),
    scheduleDays: text("schedule_days").notNull().default("[]"),
    intervalDays: integer("interval_days"),
    startsOn: text("starts_on"),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    bySlot: index("supplements_slot_idx").on(t.slotId),
  })
);

export const supplementLog = sqliteTable(
  "supplement_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    takenOn: text("taken_on").notNull(),
    supplementId: integer("supplement_id")
      .notNull()
      .references(() => supplements.id, { onDelete: "restrict" }),
    takenAt: integer("taken_at").notNull().default(now),
  },
  (t) => ({
    uniqPerDay: uniqueIndex("supplement_log_day_item_idx").on(t.takenOn, t.supplementId),
    byDate: index("supplement_log_taken_on_idx").on(t.takenOn),
  })
);

export const planTemplates = sqliteTable("plan_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default("My week"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const planTemplateDays = sqliteTable(
  "plan_template_days",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id")
      .notNull()
      .references(() => planTemplates.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    workoutTypeId: integer("workout_type_id").references(() => workoutTypes.id, {
      onDelete: "cascade",
    }),
    workoutSubtypeId: integer("workout_subtype_id").references(() => workoutSubtypes.id, {
      onDelete: "set null",
    }),
    targetRepsLow: integer("target_reps_low").notNull().default(8),
    targetRepsHigh: integer("target_reps_high").notNull().default(12),
    restSeconds: integer("rest_seconds").notNull().default(90),
    exerciseCount: integer("exercise_count").notNull().default(5),
  },
  (t) => ({
    uniqPerDay: uniqueIndex("plan_template_days_template_dow_idx").on(t.templateId, t.dayOfWeek),
  })
);

export const workoutPlans = sqliteTable(
  "workout_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    plannedOn: text("planned_on").notNull(),
    workoutTypeId: integer("workout_type_id")
      .notNull()
      .references(() => workoutTypes.id, { onDelete: "cascade" }),
    workoutSubtypeId: integer("workout_subtype_id").references(() => workoutSubtypes.id, {
      onDelete: "set null",
    }),
    targetRepsLow: integer("target_reps_low").notNull().default(8),
    targetRepsHigh: integer("target_reps_high").notNull().default(12),
    restSeconds: integer("rest_seconds").notNull().default(90),
    exerciseCount: integer("exercise_count").notNull().default(5),
    status: text("status", { enum: PLAN_STATUSES }).notNull().default("scheduled"),
    generatedBy: text("generated_by", { enum: PLAN_SOURCES }),
    generatedAt: integer("generated_at"),
    templateDayId: integer("template_day_id").references(() => planTemplateDays.id, {
      onDelete: "set null",
    }),
    workoutId: integer("workout_id").references(() => workouts.id, { onDelete: "set null" }),
    isOverride: integer("is_override", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    uniqPerDay: uniqueIndex("workout_plans_planned_on_idx").on(t.plannedOn),
    byStatus: index("workout_plans_status_idx").on(t.status),
  })
);

export const planExercises = sqliteTable(
  "plan_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => workoutPlans.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    note: text("note"),
  },
  (t) => ({
    byPlan: index("plan_exercises_plan_idx").on(t.planId),
  })
);

export const planSets = sqliteTable(
  "plan_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planExerciseId: integer("plan_exercise_id")
      .notNull()
      .references(() => planExercises.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull().default(1),
    targetReps: integer("target_reps"),
    targetWeightLb: real("target_weight_lb"),
    isWarmup: integer("is_warmup", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    byPlanExercise: index("plan_sets_plan_exercise_idx").on(t.planExerciseId),
  })
);

export const planGenerations = sqliteTable(
  "plan_generations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => workoutPlans.id, { onDelete: "cascade" }),
    source: text("source", { enum: PLAN_SOURCES }).notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    prompt: text("prompt"),
    response: text("response"),
    error: text("error"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byPlan: index("plan_generations_plan_idx").on(t.planId),
  })
);

export const dailyEnergy = sqliteTable(
  "daily_energy",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    measuredOn: text("measured_on").notNull().unique(),
    activeKcal: real("active_kcal"),
    basalKcal: real("basal_kcal"),
    source: text("source", { enum: ["manual", "apple_health"] }).notNull().default("apple_health"),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    byDate: index("daily_energy_measured_on_idx").on(t.measuredOn),
  })
);

export type GymSettings = typeof gymSettings.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type WorkoutType = typeof workoutTypes.$inferSelect;
export type WorkoutSubtype = typeof workoutSubtypes.$inferSelect;
export type RecoveryType = typeof recoveryTypes.$inferSelect;
export type RecoveryLogEntry = typeof recoveryLog.$inferSelect;
export type Vacation = typeof vacations.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type ExerciseSet = typeof exerciseSets.$inferSelect;
export type BodyMetric = typeof bodyMetrics.$inferSelect;
export type ProgressPhoto = typeof progressPhotos.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type FoodLogEntry = typeof foodLogEntries.$inferSelect;
export type SavedMeal = typeof savedMeals.$inferSelect;
export type SavedMealItem = typeof savedMealItems.$inferSelect;
export type MacroTarget = typeof macroTargets.$inferSelect;
export type ScheduledWorkout = typeof scheduledWorkouts.$inferSelect;
export type HealthIngest = typeof healthIngests.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;

export type SupplementSlot = typeof supplementSlots.$inferSelect;
export type Supplement = typeof supplements.$inferSelect;
export type SupplementLogEntry = typeof supplementLog.$inferSelect;
export type PlanTemplate = typeof planTemplates.$inferSelect;
export type PlanTemplateDay = typeof planTemplateDays.$inferSelect;
export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type PlanExercise = typeof planExercises.$inferSelect;
export type PlanSet = typeof planSets.$inferSelect;
export type PlanGeneration = typeof planGenerations.$inferSelect;
export type DailyEnergy = typeof dailyEnergy.$inferSelect;

export type SupplementSchedule = (typeof SUPPLEMENT_SCHEDULES)[number];
export type SupplementUnit = (typeof SUPPLEMENT_UNITS)[number];
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type PlanSource = (typeof PLAN_SOURCES)[number];
export type MacroDirection = (typeof MACRO_DIRECTIONS)[number];
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Meal = (typeof MEALS)[number];
export type PhotoPose = (typeof PHOTO_POSES)[number];
