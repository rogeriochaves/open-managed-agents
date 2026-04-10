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

interface NavItem {
  to: string;
  label: string;
  icon: typeof Zap;
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// LangWatch-style grouping: uppercase section labels with a handful
// of tight items under each. Mirrors DESIGN / EVALUATE / PROMPTS /
// DATA in the reference screenshot.
const SECTIONS: NavSection[] = [
  {
    label: "Build",
    items: [
      { to: "/quickstart", label: "Quickstart", icon: Zap, end: true },
      { to: "/agents", label: "Agents", icon: Bot },
      { to: "/sessions", label: "Sessions", icon: MessageSquare },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/environments", label: "Environments", icon: Box },
      { to: "/vaults", label: "Credential vaults", icon: KeyRound },
    ],
  },
  {
    label: "Analytics",
    items: [{ to: "/usage", label: "Usage & Cost", icon: BarChart3 }],
  },
];

function SidebarNavLink({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
}: NavItem & { collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
          isActive
            ? "bg-gray-100 font-medium text-gray-900"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        } ${collapsed ? "justify-center" : ""}`
      }
      title={collapsed ? label : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`h-[15px] w-[15px] shrink-0 ${
              isActive ? "text-gray-900" : "text-gray-400 group-hover:text-gray-600"
            }`}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, authEnabled, logout } = useAuth();

  return (
    <aside
      className={`flex flex-col bg-gray-100 transition-all duration-200 ${
        collapsed ? "w-14" : "w-[224px]"
      }`}
    >
      {/* ── Workspace selector (top of sidebar) ─────────────────── */}
      <div className="px-3 pt-3 pb-2">
        {!collapsed ? (
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-200/50 cursor-pointer">
            <img
              src="/logo.svg"
              alt="Open Managed Agents"
              className="h-6 w-6 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-gray-900">
                Open Agents
              </div>
              <div className="truncate text-[10px] text-gray-500">
                Default workspace
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          </button>
        ) : (
          <div className="flex justify-center">
            <img
              src="/logo.svg"
              alt="Open Managed Agents"
              className="h-7 w-7"
            />
          </div>
        )}
      </div>

      {/* ── Navigation sections ─────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {SECTIONS.map((section, idx) => (
          <div key={section.label} className={idx === 0 ? "" : "mt-4"}>
            {!collapsed && (
              <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-gray-400">
                {section.label}
              </div>
            )}
            <ul className="space-y-px">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SidebarNavLink {...item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── User footer ─────────────────────────────────────────── */}
      {authEnabled && user && (
        <div className="px-3 py-2">
          {!collapsed ? (
            <div className="flex items-center gap-2 rounded-md px-1 py-1.5">
              <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] text-gray-700 font-semibold shrink-0">
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-gray-900">
                  {user.name}
                </div>
                <div className="truncate text-[10px] text-gray-500 capitalize">
                  {user.role}
                </div>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="cursor-pointer rounded-md p-1 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              title="Logout"
              className="flex w-full items-center justify-center cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Settings + Collapse ─────────────────────────────────── */}
      <div className="px-2 pb-2 pt-1 space-y-px">
        <SidebarNavLink
          to="/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
        />
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-1 text-gray-400 hover:bg-gray-200/60 hover:text-gray-600 transition-colors cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}
