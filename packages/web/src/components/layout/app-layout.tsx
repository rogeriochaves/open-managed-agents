import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { useAuth } from "../../lib/auth-context";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, loading, authEnabled } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authEnabled && !loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [authEnabled, loading, user, navigate]);

  if (authEnabled && loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-gray-100">
      {/* Ambient background glow — subtle like LangWatch */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-orange-200/30 blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-[520px] w-[520px] rounded-full bg-blue-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full w-full">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
