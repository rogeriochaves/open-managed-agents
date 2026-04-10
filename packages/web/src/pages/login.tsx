import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message ?? "Login failed");
      }
      navigate("/quickstart");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-100 px-4">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-[420px] w-[420px] rounded-full bg-blue-200/30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[400px] rounded-2xl border border-gray-200/80 bg-white/75 p-8 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col items-center mb-7">
          <img src="/logo.svg" alt="Open Managed Agents" className="h-14 w-14 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            Open Managed Agents
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Sign in to your workspace
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                name="email"
                defaultValue="admin@localhost"
                required
                autoFocus
                autoComplete="email"
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 transition-colors"
                placeholder="admin@localhost"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20 transition-colors"
                placeholder="Your password"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={loading}
            className="w-full justify-center"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-gray-400 leading-relaxed">
          Default credentials: <span className="font-mono text-gray-500">admin@localhost / admin</span>
          <br />
          Set a production password via{" "}
          <code className="text-gray-600 font-mono">OMA_DEFAULT_ADMIN_PASSWORD</code>
        </p>
      </div>
    </div>
  );
}
