import { badRequest, requireSession } from "@/lib/api";
import { isElevated } from "@/lib/admin-auth";
import { csvFor, fullExport, isCsvTable } from "@/lib/export";
import { todayIso } from "@/lib/dates";

export async function GET(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  if (!(await isElevated())) return badRequest("re-enter your password in admin first");

  const params = new URL(request.url).searchParams;
  const table = params.get("table");

  if (table) {
    if (!isCsvTable(table)) return badRequest("unknown table");
    return new Response(csvFor(table), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gym-${table}-${todayIso()}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new Response(JSON.stringify(fullExport(), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gym-export-${todayIso()}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
