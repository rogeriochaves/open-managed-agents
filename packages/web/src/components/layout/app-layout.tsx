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
      <div className="flex h-screen w-screen items-center justify-center bg-surface-primary">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-primary">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
