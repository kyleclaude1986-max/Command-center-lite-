import { AdminList } from "@/components/admin/AdminList";
import { isElevated } from "@/lib/admin-auth";
import { goalOptions, recoveryTypeItems } from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

export default async function AdminRecoveryTypesPage() {
  if (!(await isElevated())) return null;

  return (
    <AdminList
      entity="recovery-types"
      title="Recovery"
      description="Sauna, red light, and anything else you add. Give one a goal and it gets its own weekly target and streak, same as a workout goal."
      addLabel="Add recovery"
      items={recoveryTypeItems()}
      fields={[
        { key: "name", label: "Name", type: "text", placeholder: "Cold plunge" },
        { key: "goalId", label: "Counts toward", type: "select", options: goalOptions() },
        { key: "color", label: "Colour", type: "color" },
        { key: "position", label: "Order", type: "number" },
      ]}
    />
  );
}
