import { AdminList } from "@/components/admin/AdminList";
import { isElevated } from "@/lib/admin-auth";
import { goalItems } from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

export default async function AdminGoalsPage() {
  if (!(await isElevated())) return null;

  return (
    <AdminList
      entity="goals"
      title="Goals"
      description="Each goal tracks its own weekly target and its own streak. A minimum duration means a workout only counts once it is long enough."
      addLabel="Add goal"
      items={goalItems()}
      fields={[
        { key: "name", label: "Name", type: "text", placeholder: "Cardio" },
        { key: "targetDaysPerWeek", label: "Days a week", type: "number" },
        {
          key: "minDurationMinutes",
          label: "Minimum minutes",
          type: "number",
          hint: "Leave blank if any length counts.",
        },
        { key: "position", label: "Order", type: "number" },
      ]}
    />
  );
}
