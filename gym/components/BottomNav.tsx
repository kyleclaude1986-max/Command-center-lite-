"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/workouts", label: "Workouts" },
  { href: "/food", label: "Food" },
  { href: "/body", label: "Body" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-line bg-paper-card/95 backdrop-blur">
      <ul className="mx-auto flex max-w-2xl pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-[52px] items-center justify-center text-sm font-medium transition-colors",
                  active ? "text-ink" : "text-ink-muted"
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
