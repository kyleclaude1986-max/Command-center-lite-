import { AdminList } from "@/components/admin/AdminList";
import { isElevated } from "@/lib/admin-auth";
import {
  goalOptions,
  workoutSubtypeItems,
  workoutTypeItems,
  workoutTypeOptions,
} from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

export default async function AdminWorkoutTypesPage() {
  if (!(await isElevated())) return null;

  return (
    <>
      <AdminList
        entity="workout-types"
        title="Workout types"
        description="These are the buttons on the log sheet. Archiving one hides it from logging but keeps every workout ever logged against it."
        addLabel="Add type"
        items={workoutTypeItems()}
        fields={[
          { key: "name", label: "Name", type: "text", placeholder: "West O Strength" },
          { key: "goalId", label: "Counts toward", type: "select", options: goalOptions() },
          { key: "hasSubtypes", label: "Has sub-days", type: "checkbox" },
          { key: "color", label: "Colour", type: "color" },
          { key: "position", label: "Order", type: "number" },
        ]}
      />

      <AdminList
        entity="workout-subtypes"
        title="Sub-days"
        description="The split within a type that has sub-days, like back, chest, and legs."
        addLabel="Add sub-day"
        items={workoutSubtypeItems()}
        fields={[
          { key: "name", label: "Name", type: "text", placeholder: "Back" },
          {
            key: "workoutTypeId",
            label: "Belongs to",
            type: "select",
            options: workoutTypeOptions(),
          },
          { key: "position", label: "Order", type: "number" },
        ]}
      />
    </>
  );
}
