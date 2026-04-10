import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Zap,
  Bot,
  MessageSquare,
  Box,
  KeyRound,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  BarChart3,
  LogOut,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { useAuth } from "../../lib/auth-context";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: "/quickstart", label: "Quickstart", icon: Zap },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/sessions", label: "Sessions", icon: MessageSquare },
  { to: "/environments", label: "Environments", icon: Box },
  { to: "/vaults", label: "Credential vaults", icon: KeyRound },
];

const analyticsItems = [
  { to: "/usage", label: "Usage & Cost", icon: BarChart3 },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const { user, authEnabled, logout } = useAuth();

  return (
    <aside
      className={`flex flex-col border-r border-surface-border bg-surface-sidebar transition-all duration-200 ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      {/* ── Branding ─────────────────────────────────────────────── */}
      <div className="flex h-12 items-center gap-2 border-b border-surface-border px-3">
        <img src="/logo.svg" alt="Open Agents" className="h-6 w-6 shrink-0" />
        {!collapsed && (
          <span className="text-sm font-semibold text-text-primary">
            Open Agents
          </span>
        )}
      </div>

      {/* ── Workspace selector ────────────────────────────────────── */}
      {!collapsed && (
        <button className="flex w-full items-center justify-between border-b border-surface-border px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer">
          <span>Default</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2">
        {/* Section header */}
        <button
          onClick={() => setSectionOpen((o) => !o)}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted hover:text-text-secondary cursor-pointer ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {!collapsed && (
            <>
              <span>Managed Agents</span>
              <Badge variant="new" className="ml-auto text-[10px] px-1.5 py-0">
                New
              </Badge>
            </>
          )}
          {collapsed && <Bot className="h-4 w-4" />}
        </button>

        {sectionOpen && (
          <ul className="mt-0.5 space-y-0.5 px-1.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-surface-hover text-accent-blue"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    } ${collapsed ? "justify-center" : ""}`
                  }
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        )}

        {/* Analytics section */}
        {!collapsed && (
          <div className="mt-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
            Analytics
          </div>
        )}
        <ul className="mt-0.5 space-y-0.5 px-1.5">
          {analyticsItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-surface-hover text-accent-blue"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  } ${collapsed ? "justify-center" : ""}`
                }
                title={collapsed ? label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── User ──────────────────────────────────────────────── */}
      {authEnabled && user && (
        <div className="border-t border-surface-border px-3 py-2">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-accent-blue/20 flex items-center justify-center text-xs text-accent-blue font-medium shrink-0">
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-text-primary truncate">{user.name}</div>
                <div className="text-[10px] text-text-muted truncate">{user.role}</div>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="cursor-pointer p-1 text-text-muted hover:text-text-primary"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              title="Logout"
              className="flex w-full items-center justify-center cursor-pointer p-1 text-text-muted hover:text-text-primary"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Settings + Collapse ─────────────────────────────────── */}
      <div className="border-t border-surface-border p-2 space-y-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-surface-hover text-accent-blue"
                : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
            } ${collapsed ? "justify-center" : ""}`
          }
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
