import { AdminList } from "@/components/admin/AdminList";
import { isElevated } from "@/lib/admin-auth";
import { exerciseItems } from "@/lib/admin-queries";
import { MUSCLE_GROUP_OPTIONS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AdminExercisesPage() {
  if (!(await isElevated())) return null;

  return (
    <AdminList
      entity="exercises"
      title="Exercises"
      description="The library the strength log picks from. Archive anything you never do so it stops cluttering the list."
      addLabel="Add exercise"
      items={exerciseItems()}
      fields={[
        { key: "name", label: "Name", type: "text", placeholder: "Cable Crunch" },
        { key: "muscleGroup", label: "Muscle group", type: "select", options: MUSCLE_GROUP_OPTIONS },
      ]}
    />
  );
}
