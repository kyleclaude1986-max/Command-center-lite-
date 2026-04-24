import "@/lib/sync/bootstrap";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import {
  getMetrics,
  getOpenTodos,
  getTodayEvents,
  getWeekEvents,
} from "@/lib/queries";
import { TodayPanel } from "@/components/TodayPanel";
import { WeekPanel } from "@/components/WeekPanel";
import { TodosPanel } from "@/components/TodosPanel";
import { SalesStrip } from "@/components/SalesStrip";
import { RefreshButton } from "@/components/RefreshButton";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const now = new Date();
  const today = getTodayEvents(now);
  const week = getWeekEvents(now);
  const todos = getOpenTodos();
  const metrics = getMetrics();
  const nowUnix = Math.floor(now.getTime() / 1000);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold">{greeting(now)}, Kyle.</h1>
          <p className="text-sm text-ink-muted">{fmtDate(nowUnix)}</p>
        </div>
        <RefreshButton label="Refresh everything" />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <TodayPanel events={today} />
          <WeekPanel events={week} now={now} />
        </div>
        <div className="space-y-5">
          <TodosPanel todos={todos} now={now} />
        </div>
      </div>

      <div className="mt-6">
        <SalesStrip ytd={metrics.ytd} mtd={metrics.mtd} pipeline={metrics.pipeline} asOf={metrics.asOf} />
      </div>
    </main>
  );
}
