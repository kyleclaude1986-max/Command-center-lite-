import { AdminList } from "@/components/admin/AdminList";
import { isElevated } from "@/lib/admin-auth";
import { vacationItems } from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

export default async function AdminVacationsPage() {
  if (!(await isElevated())) return null;

  return (
    <AdminList
      entity="vacations"
      title="Vacations"
      description="A week's targets scale down to the days you were home. Three days away turns a 5-day gym goal into 3, so a trip cannot break a streak."
      addLabel="Add vacation"
      canArchive={false}
      items={vacationItems()}
      fields={[
        { key: "label", label: "Label", type: "text", placeholder: "Cabo" },
        { key: "startsOn", label: "First day away", type: "date" },
        { key: "endsOn", label: "Last day away", type: "date" },
      ]}
    />
  );
}
