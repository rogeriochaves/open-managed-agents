import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Globe, Shield } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, statusVariant } from "../components/ui/badge";
import * as api from "../lib/api";

export function EnvironmentDetailPage() {
  const { environmentId } = useParams<{ environmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [archiving, setArchiving] = useState(false);

  const { data: env, isLoading } = useQuery({
    queryKey: ["environment", environmentId],
    queryFn: () => api.getEnvironment(environmentId!),
    enabled: !!environmentId,
  });

  const handleArchive = async () => {
    if (!env) return;
    if (
      !window.confirm(
        `Archive environment "${env.name}"? Running sessions that still reference it will continue until they finish.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      await api.archiveEnvironment(env.id);
      await queryClient.invalidateQueries({ queryKey: ["environments"] });
      navigate("/environments");
    } catch {
      setArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading environment...</p>
      </div>
    );
  }

  if (!env) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Environment not found</p>
      </div>
    );
  }

  const status = env.archived_at ? "archived" : "active";
  const networking = env.config?.networking;
  const packages = env.config?.packages;

  const pkgEntries = packages
    ? Object.entries(packages)
        .filter(([k, v]) => k !== "type" && Array.isArray(v) && (v as string[]).length > 0)
        .map(([k, v]) => ({ manager: k, packages: v as string[] }))
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-surface-border px-6 py-3">
        <Link
          to="/environments"
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-text-primary">
            {env.name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={statusVariant(status)}>{status}</Badge>
            <span className="text-xs text-text-muted">{env.config?.type ?? "cloud"}</span>
            <span className="text-xs text-text-muted">·</span>
            <span className="text-xs text-text-muted font-mono">{env.id}</span>
          </div>
        </div>
        {status === "active" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchive}
            disabled={archiving}
          >
            <Archive className="h-3.5 w-3.5" />
            {archiving ? "Archiving…" : "Archive"}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Networking */}
          <section>
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {networking?.type === "unrestricted" ? (
                <Globe className="h-4 w-4 text-green-400" />
              ) : (
                <Shield className="h-4 w-4 text-yellow-400" />
              )}
              Networking: {networking?.type ?? "unknown"}
            </h3>
            {networking?.type === "limited" && (
              <div className="mt-3 space-y-2">
                {"allowed_hosts" in networking && (
                  <div>
                    <dt className="text-xs text-text-muted">Allowed hosts</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {(networking as any).allowed_hosts?.length > 0
                        ? (networking as any).allowed_hosts.map((h: string) => (
                            <Badge key={h} variant="default">
                              {h}
                            </Badge>
                          ))
                        : <span className="text-xs text-text-muted">None</span>}
                    </dd>
                  </div>
                )}
                <div className="flex gap-4 text-xs">
                  <span className="text-text-muted">
                    MCP servers: {(networking as any).allow_mcp_servers ? "allowed" : "blocked"}
                  </span>
                  <span className="text-text-muted">
                    Package managers: {(networking as any).allow_package_managers ? "allowed" : "blocked"}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Packages */}
          <section>
            <h3 className="text-sm font-medium text-text-primary">Packages</h3>
            {pkgEntries.length === 0 ? (
              <p className="mt-2 text-xs text-text-muted">No packages configured.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {pkgEntries.map(({ manager, packages: pkgs }) => (
                  <div key={manager}>
                    <dt className="text-xs font-medium text-text-secondary uppercase">
                      {manager}
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {pkgs.map((p) => (
                        <Badge key={p} variant="default">
                          {p}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                ))}
              </div>
            )}
          </section>

          {env.description && (
            <section>
              <h3 className="text-sm font-medium text-text-primary">Description</h3>
              <p className="mt-1 text-sm text-text-secondary">{env.description}</p>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 border-l border-surface-border overflow-y-auto p-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Details
          </h3>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs text-text-muted">Environment ID</dt>
              <dd className="mt-0.5 text-sm text-text-primary font-mono break-all">
                {env.id}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Type</dt>
              <dd className="mt-0.5 text-sm text-text-primary">{env.config?.type ?? "cloud"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Created</dt>
              <dd className="mt-0.5 text-sm text-text-secondary">
                {new Date(env.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Updated</dt>
              <dd className="mt-0.5 text-sm text-text-secondary">
                {new Date(env.updated_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
