/* =========================================================================
   MODULE: components/app-shell.jsx
   The Site Office shell: dark rail + contextual bar + content well.

   The rail is `bg-emphasis` — a deep slate that stays dark in BOTH themes,
   rather than flipping with the rest of the UI. That is deliberate. A
   permanently dark rail gives the app a fixed anchor and a silhouette, which
   is most of what separates software that looks designed from software that
   looks like a form on a page. It is also what Linear, Vercel and Procore
   all do. The content well still themes normally, so dark mode is a real
   dark mode rather than a dark chrome with a white page.
   ========================================================================= */

import React from "react";
import {
  Building2, ChevronLeft, ChevronRight, FileStack, LayoutGrid,
  Search, Settings, Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SITE_OFFICE_NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "jobs", label: "Jobs", icon: FileStack },
  { id: "clients", label: "Clients", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AppShell({
  view,
  onView,
  breadcrumb = [],
  actions,
  search,
  onSearch,
  children,
}) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div
      className="grid min-h-[calc(100vh-66px)] bg-paper"
      style={{ gridTemplateColumns: collapsed ? "60px 1fr" : "212px 1fr" }}
    >
      <Rail view={view} onView={onView} collapsed={collapsed} onCollapse={setCollapsed} />

      <div className="flex min-w-0 flex-col">
        <ContextBar breadcrumb={breadcrumb} actions={actions} search={search} onSearch={onSearch} />
        <main className="min-w-0 flex-1 px-6 py-6 xl:px-8">{children}</main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- rail */

function Rail({ view, onView, collapsed, onCollapse }) {
  return (
    <nav
      className="sticky top-[66px] flex h-[calc(100vh-66px)] flex-col bg-emphasis"
      aria-label="Site Office"
    >
      <div className={cn("flex items-center gap-2 px-4 pb-3 pt-4", collapsed && "justify-center px-0")}>
        <span className="grid size-6 shrink-0 place-items-center bg-hivis">
          <Building2 className="size-3.5 text-on-hivis" />
        </span>
        {!collapsed && (
          <span className="font-display text-sm uppercase tracking-[0.12em] text-on-emphasis">
            Site Office
          </span>
        )}
      </div>

      <div className="mx-4 mb-2 h-px bg-white/10" />

      <ul className="flex-1 space-y-0.5 px-2">
        {SITE_OFFICE_NAV.map((item) => {
          const active = view === item.id;
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                onClick={() => onView(item.id)}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors",
                  collapsed && "justify-center px-0",
                  active ? "bg-white/10 text-on-emphasis" : "text-on-emphasis-soft hover:bg-white/5 hover:text-on-emphasis"
                )}
              >
                {/* The accent bar, not a fill, marks the active item — it reads
                    at a glance without shouting over the content. */}
                <span
                  className={cn(
                    "absolute left-0 h-4 w-0.5 rounded-r bg-hivis transition-opacity",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon className="size-4 shrink-0" />
                {!collapsed && (
                  <span className="font-mono text-[11px] font-medium tracking-wide">{item.label}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mx-4 mb-2 h-px bg-white/10" />

      <div className={cn("flex items-center gap-2 px-3 pb-3", collapsed && "justify-center px-0")}>
        <Avatar className="size-7">
          <AvatarFallback>BY</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[10px] text-on-emphasis">Your company</div>
            <div className="truncate font-mono text-[9px] text-on-emphasis-soft">Builder</div>
          </div>
        )}
        <button
          onClick={() => onCollapse(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid size-6 shrink-0 place-items-center rounded-sm text-on-emphasis-soft transition-colors hover:bg-white/10 hover:text-on-emphasis"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------- context bar */

function ContextBar({ breadcrumb, actions, search, onSearch }) {
  return (
    <div className="sticky top-[66px] z-20 flex flex-wrap items-center gap-3 border-b border-rule bg-paper/85 px-6 py-2.5 backdrop-blur xl:px-8">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
        {breadcrumb.map((crumb, i) => (
          <React.Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <span className="text-steel">/</span>}
            {crumb.onClick ? (
              <button
                onClick={crumb.onClick}
                className="truncate font-mono text-[11px] text-steel transition-colors hover:text-ink"
              >
                {crumb.label}
              </button>
            ) : (
              <span className="truncate font-mono text-[11px] font-bold text-ink">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="flex-1" />

      {onSearch && (
        <label className="relative hidden items-center sm:flex">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-steel" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search jobs, clients…"
            className="h-7 w-52 rounded-sm border border-rule bg-card pl-7 pr-2 font-mono text-[11px] text-ink placeholder:text-steel focus:border-ink focus:outline-none"
          />
        </label>
      )}

      {actions}
    </div>
  );
}

export default AppShell;
