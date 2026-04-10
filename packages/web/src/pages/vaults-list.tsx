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

export function VaultsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [afterId, setAfterId] = useState<string | undefined>();
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  // ── Create dialog state ─────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const resetCreateForm = () => {
    setNewDisplayName("");
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (!newDisplayName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const vault = await api.createVault({
        display_name: newDisplayName.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["vaults"] });
      setCreateOpen(false);
      resetCreateForm();
      navigate(`/vaults/${vault.id}`);
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create vault");
    } finally {
      setCreating(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["vaults", statusFilter, afterId],
    queryFn: () =>
      api.listVaults({
        include_archived: statusFilter === "all" ? true : undefined,
        after_id: afterId,
        limit: 20,
      }),
  });

  const vaults = data?.data ?? [];
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
            Credential vaults
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage credential vaults that provide your agents with access to MCP
            servers and other tools.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New vault
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
            <TableHeadCell>Created</TableHeadCell>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableEmpty colSpan={3} title="Loading vaults..." />
            ) : vaults.length === 0 ? (
              <TableEmpty
                colSpan={3}
                title="No vaults yet"
                description="Create your first vault to get started."
              />
            ) : (
              vaults.map((vault) => {
                const status = vault.archived_at ? "archived" : "active";
                return (
                  <TableRow
                    key={vault.id}
                    onClick={() => navigate(`/vaults/${vault.id}`)}
                  >
                    <TableCell>
                      <span className="font-medium">
                        {vault.display_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(status)}>{status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary text-xs">
                        {new Date(vault.created_at).toLocaleDateString()}
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

      {/* Create vault dialog ─────────────────────────────────── */}
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
                  New vault
                </h3>
                <p className="mt-0.5 text-xs text-text-muted">
                  A vault holds encrypted credentials (API keys, OAuth
                  tokens) that your agents can read via MCP connectors.
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
                Display name
              </span>
              <input
                type="text"
                autoFocus
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="e.g. Support Stack Credentials"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </label>

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
                disabled={creating || !newDisplayName.trim()}
              >
                {creating ? "Creating…" : "Create vault"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
