"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, LogOut, PanelLeft, PanelsTopLeft, Settings } from "lucide-react";
import { useState } from "react";

import { OpensyncLogo } from "@/components/brand/opensync-logo";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: PanelsTopLeft, label: "Vaults" },
  { href: "/vault", icon: FolderOpen, label: "Explorador" },
  { href: "/settings", icon: Settings, label: "Configurações" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <aside
      className={cn(
        "flex flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out",
        collapsed ? "w-12" : "w-[220px]"
      )}
    >
      {/* Header: toggle + logo */}
      <div
        className={cn(
          "flex h-12 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center" : "gap-2 px-2"
        )}
      >
        <button
          type="button"
          title={collapsed ? "Expandir painel" : "Recolher painel"}
          onClick={() => setCollapsed((v) => !v)}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <PanelLeft
            className={cn(
              "size-4 transition-transform duration-200",
              collapsed && "rotate-180"
            )}
          />
        </button>

        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <OpensyncLogo href="/dashboard" className="block origin-left scale-[0.72]" />
          </div>
        )}
      </div>

      {!collapsed ? <WorkspaceSwitcher /> : null}

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-1.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex items-center rounded-md transition-colors",
                collapsed
                  ? "h-9 w-9 justify-center"
                  : "h-8 gap-2.5 px-2.5",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && (
                <span className="truncate text-sm">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="shrink-0 border-t border-sidebar-border p-1.5">
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            title="Sair"
            className={cn(
              "flex items-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              collapsed ? "h-9 w-9 justify-center" : "h-8 w-full gap-2.5 px-2.5"
            )}
          >
            <LogOut className="size-4 shrink-0" />
            {!collapsed && <span className="truncate text-sm">Sair</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}
