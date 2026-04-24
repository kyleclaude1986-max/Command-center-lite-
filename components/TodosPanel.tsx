import { type BloomTodo } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";
import { RefreshButton } from "./RefreshButton";

export function TodosPanel({ todos, now = new Date() }: { todos: BloomTodo[]; now?: Date }) {
  const nowUnix = Math.floor(now.getTime() / 1000);
  return (
    <section className="card card-pad">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="section-title">Bloom To-Dos</h2>
        <RefreshButton source="bloom" />
      </header>
      {todos.length === 0 ? (
        <p className="text-sm text-ink-muted">No open to-dos.</p>
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => {
            const overdue = t.dueAt && t.dueAt < nowUnix;
            return (
              <li key={t.id} className="text-sm">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-ink-muted shrink-0" />
                  <div className="flex-1">
                    <div className="leading-snug">{t.title}</div>
                    <div className="text-xs text-ink-muted">
                      {t.dueAt ? (
                        <span className={overdue ? "text-red-600" : ""}>
                          {overdue ? "Overdue · " : "Due "}
                          {fmtDate(t.dueAt)}
                        </span>
                      ) : (
                        "No due date"
                      )}
                      {t.team && <span> · {t.team}</span>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
