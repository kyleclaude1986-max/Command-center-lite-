import { ok, requireSession } from "@/lib/api";
import { materializePlans } from "@/lib/planning";

export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;

  const result = materializePlans();
  return ok(result);
}
