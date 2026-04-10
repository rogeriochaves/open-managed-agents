import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, statusVariant } from "../components/ui/badge";
import {
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Pagination,
} from "../components/ui/table";
import * as api from "../lib/api";

type StatusFilter = "all" | "active";
type Networking = "unrestricted" | "limited";

export function EnvironmentsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [afterId, setAfterId] = useState<string | undefined>();
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  // ── Create dialog state ─────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newNetworking, setNewNetworking] = useState<Networking>("unrestricted");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const resetCreateForm = () => {
    setNewName("");
    setNewDescription("");
    setNewNetworking("unrestricted");
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.createEnvironment({
        name: newName.trim(),
        description: newDescription.trim() || null,
        config: {
          type: "cloud",
          networking:
            newNetworking === "unrestricted"
              ? { type: "unrestricted" }
              : {
                  type: "limited",
                  allowed_hosts: [],
                  allow_mcp_servers: true,
                  allow_package_managers: true,
                },
          packages: { apt: [], cargo: [], gem: [], go: [], npm: [], pip: [] },
        },
      } as any);
      await queryClient.invalidateQueries({ queryKey: ["environments"] });
      setCreateOpen(false);
      resetCreateForm();
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create environment");
    } finally {
      setCreating(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["environments", statusFilter, afterId],
    queryFn: () =>
      api.listEnvironments({
        include_archived: statusFilter === "all" ? true : undefined,
        after_id: afterId,
        limit: 20,
      }),
  });

  const environments = data?.data ?? [];
  const hasMore = data?.has_more ?? false;

  const handleNextPage = () => {
    if (data?.last_id) {
      setCursorStack((s) => [...s, afterId ?? ""]);
      setAfterId(data.last_id);
    }
  };

  const handlePrevPage = () => {
    const prev = cursorStack[cursorStack.length - 1];
    setCursorStack((s) => s.slice(0, -1));
    setAfterId(prev || undefined);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Environments
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Configuration template for containers, such as sessions or code
            execution.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add environment
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-5 flex items-center gap-1">
        {(["all", "active"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setStatusFilter(f);
              setAfterId(undefined);
              setCursorStack([]);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              statusFilter === f
                ? "bg-surface-hover text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {f === "all" ? "All" : "Active"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="mt-4">
        <Table>
          <TableHead>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell>Type</TableHeadCell>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableEmpty colSpan={3} title="Loading environments..." />
            ) : environments.length === 0 ? (
              <TableEmpty
                colSpan={3}
                title="No environments yet"
                description="Create your first environment to get started."
              />
            ) : (
              environments.map((env) => {
                const status = env.archived_at ? "archived" : "active";
                return (
                  <TableRow
                    key={env.id}
                    onClick={() => navigate(`/environments/${env.id}`)}
                  >
                    <TableCell>
                      <span className="font-medium">{env.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(status)}>{status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary text-xs">
                        {env.config.type}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <Pagination
          hasMore={hasMore}
          hasPrev={cursorStack.length > 0}
          onNext={handleNextPage}
          onPrev={handlePrevPage}
        />
      </div>

      {/* Create environment dialog ─────────────────────────────── */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCreateOpen(false);
              resetCreateForm();
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Add environment
                </h3>
                <p className="mt-0.5 text-xs text-text-muted">
                  Configure networking and package policies for agents running in this environment.
                </p>
              </div>
              <button
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
                className="cursor-pointer rounded-md p-1 text-text-muted hover:bg-surface-hover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Name
              </span>
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. production-web"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Description
              </span>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
            </label>

            <fieldset className="mt-4">
              <legend className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Networking
              </legend>
              <div className="mt-2 space-y-1.5">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-surface-border p-3 hover:bg-surface-hover">
                  <input
                    type="radio"
                    name="networking"
                    value="unrestricted"
                    checked={newNetworking === "unrestricted"}
                    onChange={() => setNewNetworking("unrestricted")}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-text-primary">Unrestricted</div>
                    <div className="text-[11px] text-text-muted">
                      Full outbound internet — agents can hit any host.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-surface-border p-3 hover:bg-surface-hover">
                  <input
                    type="radio"
                    name="networking"
                    value="limited"
                    checked={newNetworking === "limited"}
                    onChange={() => setNewNetworking("limited")}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-text-primary">Limited</div>
                    <div className="text-[11px] text-text-muted">
                      Only MCP servers + package managers by default. Add allowed hosts later.
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>

            {createError && (
              <p className="mt-3 text-xs text-red-600">{createError}</p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating…" : "Create environment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
