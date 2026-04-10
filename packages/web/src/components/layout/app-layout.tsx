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
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      {/* Main content is a floating rounded card — LangWatch pattern.
          Margin gap from the sidebar + top/right/bottom edges, white
          surface with a subtle border and big top-left/bottom-left
          radius. */}
      <main className="flex-1 overflow-y-auto my-2 mr-2 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Outlet />
      </main>
    </div>
  );
}
