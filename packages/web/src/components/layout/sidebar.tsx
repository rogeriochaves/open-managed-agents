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
      className={`flex flex-col border-r border-gray-200 bg-white/70 backdrop-blur-xl transition-all duration-200 ${
        collapsed ? "w-14" : "w-[220px]"
      }`}
    >
      {/* ── Branding ─────────────────────────────────────────────── */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-200 px-4">
        <img src="/logo.svg" alt="Open Managed Agents" className="h-7 w-7 shrink-0" />
        {!collapsed && (
          <span className="text-[13px] font-semibold text-gray-900 tracking-tight">
            Open Agents
          </span>
        )}
      </div>

      {/* ── Workspace selector ────────────────────────────────────── */}
      {!collapsed && (
        <button className="mx-3 my-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer">
          <span className="truncate">Default workspace</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      )}

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {/* Section header */}
        {!collapsed ? (
          <button
            onClick={() => setSectionOpen((o) => !o)}
            className="mt-1 flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 hover:text-gray-500 cursor-pointer"
          >
            <span>Managed Agents</span>
          </button>
        ) : (
          <div className="mt-1 flex justify-center">
            <Bot className="h-4 w-4 text-gray-400" />
          </div>
        )}

        {sectionOpen && (
          <ul className="space-y-0.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/quickstart"}
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-orange-50 text-orange-700"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    } ${collapsed ? "justify-center" : ""}`
                  }
                  title={collapsed ? label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          isActive ? "text-orange-500" : "text-gray-400 group-hover:text-gray-600"
                        }`}
                      />
                      {!collapsed && <span>{label}</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        )}

        {/* Analytics section */}
        {!collapsed && (
          <div className="mt-4 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
            Analytics
          </div>
        )}
        <ul className="mt-0.5 space-y-0.5">
          {analyticsItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-orange-50 text-orange-700"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  } ${collapsed ? "justify-center" : ""}`
                }
                title={collapsed ? label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? "text-orange-500" : "text-gray-400 group-hover:text-gray-600"
                      }`}
                    />
                    {!collapsed && <span>{label}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── User ──────────────────────────────────────────────── */}
      {authEnabled && user && (
        <div className="border-t border-gray-200 px-3 py-2.5">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center text-xs text-orange-700 font-semibold shrink-0">
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-gray-900 truncate">{user.name}</div>
                <div className="text-[10px] text-gray-500 truncate capitalize">{user.role}</div>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              title="Logout"
              className="flex w-full items-center justify-center cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Settings + Collapse ─────────────────────────────────── */}
      <div className="border-t border-gray-200 p-2 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
              isActive
                ? "bg-orange-50 text-orange-700"
                : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            } ${collapsed ? "justify-center" : ""}`
          }
          title={collapsed ? "Settings" : undefined}
        >
          {({ isActive }) => (
            <>
              <Settings
                className={`h-[18px] w-[18px] shrink-0 ${
                  isActive ? "text-orange-500" : "text-gray-400 group-hover:text-gray-600"
                }`}
              />
              {!collapsed && <span>Settings</span>}
            </>
          )}
        </NavLink>
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
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
