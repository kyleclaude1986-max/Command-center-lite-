import { AdminList } from "@/components/admin/AdminList";
import { isElevated } from "@/lib/admin-auth";
import {
  supplementItems,
  supplementSlotItems,
  supplementSlotOptions,
} from "@/lib/admin-queries";
import { SUPPLEMENT_UNITS } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const SCHEDULES = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Specific weekdays" },
  { value: "workout_days", label: "Workout days only" },
  { value: "interval", label: "Every N days" },
];

export default async function AdminSupplementsPage() {
  if (!(await isElevated())) return null;

  return (
    <>
      <AdminList
        entity="supplements"
        title="Supplements"
        description="Your stack. Everything defaults to every day — set a different schedule only where something doesn't run daily."
        addLabel="Add supplement"
        items={supplementItems()}
        fields={[
          { key: "name", label: "Name", type: "text", placeholder: "Creatine monohydrate" },
          { key: "dose", label: "Dose", type: "number", placeholder: "5" },
          {
            key: "unit",
            label: "Unit",
            type: "select",
            options: SUPPLEMENT_UNITS.map((u) => ({ value: u, label: u })),
          },
          {
            key: "slotId",
            label: "Time of day",
            type: "select",
            options: supplementSlotOptions(),
          },
          { key: "scheduleKind", label: "Schedule", type: "select", options: SCHEDULES },
          {
            key: "scheduleDays",
            label: "Which weekdays",
            type: "weekdays",
            hint: "Only used when the schedule is specific weekdays.",
          },
          {
            key: "intervalDays",
            label: "Every N days",
            type: "number",
            hint: "Only used when the schedule is every N days.",
          },
          {
            key: "startsOn",
            label: "Counting from",
            type: "date",
            hint: "Anchor date for an every-N-days schedule.",
          },
          { key: "position", label: "Order", type: "number" },
        ]}
      />

      <AdminList
        entity="supplement-slots"
        title="Times of day"
        description="The groups your stack is logged in. Fewer, well-named slots beat one long list."
        addLabel="Add slot"
        items={supplementSlotItems()}
        fields={[
          { key: "name", label: "Name", type: "text", placeholder: "Pre-workout" },
          { key: "position", label: "Order", type: "number" },
        ]}
      />
    </>
  );
}
