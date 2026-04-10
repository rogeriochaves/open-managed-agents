import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Plus, Key, Shield, Trash2, X } from "lucide-react";
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
} from "../components/ui/table";
import * as api from "../lib/api";

export function VaultDetailPage() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [archiving, setArchiving] = useState(false);

  const { data: vault, isLoading } = useQuery({
    queryKey: ["vault", vaultId],
    queryFn: () => api.getVault(vaultId!),
    enabled: !!vaultId,
  });

  // ── Credentials fetch ─────────────────────────────────────────
  const { data: credentialsData } = useQuery({
    queryKey: ["vault-credentials", vaultId],
    queryFn: () => api.listVaultCredentials(vaultId!),
    enabled: !!vaultId,
  });
  const credentials = credentialsData?.data ?? [];

  // ── Add credential modal state ────────────────────────────────
  const [credOpen, setCredOpen] = useState(false);
  const [credName, setCredName] = useState("");
  const [credValue, setCredValue] = useState("");
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);

  const resetCredForm = () => {
    setCredName("");
    setCredValue("");
    setCredError(null);
  };

  const handleCreateCredential = async () => {
    if (!vaultId || !credName.trim() || !credValue) return;
    setCredSaving(true);
    setCredError(null);
    try {
      await api.createVaultCredential(vaultId, {
        name: credName.trim(),
        value: credValue,
      });
      await queryClient.invalidateQueries({
        queryKey: ["vault-credentials", vaultId],
      });
      setCredOpen(false);
      resetCredForm();
    } catch (err: any) {
      setCredError(err?.message ?? "Failed to save credential");
    } finally {
      setCredSaving(false);
    }
  };

  const handleDeleteCredential = async (credId: string, credName: string) => {
    if (!vaultId) return;
    if (!window.confirm(`Delete credential "${credName}"? This cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteVaultCredential(vaultId, credId);
      await queryClient.invalidateQueries({
        queryKey: ["vault-credentials", vaultId],
      });
    } catch {
      // swallow — refetch will reflect the real state
    }
  };

  const handleArchive = async () => {
    if (!vault) return;
    if (
      !window.confirm(
        `Archive vault "${vault.display_name}"? Agents referencing its credentials will lose access.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      await api.archiveVault(vault.id);
      await queryClient.invalidateQueries({ queryKey: ["vaults"] });
      navigate("/vaults");
    } catch {
      setArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading vault...</p>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Vault not found</p>
      </div>
    );
  }

  const status = vault.archived_at ? "archived" : "active";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-surface-border px-6 py-3">
        <Link
          to="/vaults"
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-text-primary">
            {vault.display_name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={statusVariant(status)}>{status}</Badge>
            <span className="text-xs text-text-muted font-mono">{vault.id}</span>
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
      <div className="flex-1 overflow-y-auto p-6">
        {/* Credentials section */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Key className="h-4 w-4" />
            Credentials
            {credentials.length > 0 && (
              <span className="text-xs text-text-muted font-normal">
                ({credentials.length})
              </span>
            )}
          </h3>
          {status === "active" && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setCredOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add credential
            </Button>
          )}
        </div>

        <div className="mt-4">
          <Table>
            <TableHead>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Created</TableHeadCell>
              <TableHeadCell>Updated</TableHeadCell>
              <TableHeadCell className="text-right">Actions</TableHeadCell>
            </TableHead>
            <TableBody>
              {credentials.length === 0 ? (
                <TableEmpty
                  colSpan={4}
                  title="No credentials yet"
                  description="Add credentials to give your agents access to MCP servers and tools."
                />
              ) : (
                credentials.map((cred) => (
                  <TableRow key={cred.id}>
                    <TableCell>
                      <span className="font-medium font-mono text-xs">
                        {cred.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-text-secondary">
                        {new Date(cred.created_at).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-text-secondary">
                        {new Date(cred.updated_at).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() =>
                          handleDeleteCredential(cred.id, cred.name)
                        }
                        className="cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted hover:bg-red-500/10 hover:text-red-600"
                        title="Delete credential"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Vault details */}
        <div className="mt-8">
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Vault Details
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-text-muted">Vault ID</dt>
              <dd className="mt-0.5 text-sm text-text-primary font-mono break-all">
                {vault.id}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Display Name</dt>
              <dd className="mt-0.5 text-sm text-text-primary">
                {vault.display_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Created</dt>
              <dd className="mt-0.5 text-sm text-text-secondary">
                {new Date(vault.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Updated</dt>
              <dd className="mt-0.5 text-sm text-text-secondary">
                {new Date(vault.updated_at).toLocaleString()}
              </dd>
            </div>
          </dl>

          {Object.keys(vault.metadata ?? {}).length > 0 && (
            <div className="mt-4">
              <dt className="text-xs text-text-muted">Metadata</dt>
              <dd className="mt-1 space-y-1">
                {Object.entries(vault.metadata).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted">{k}:</span>
                    <span className="text-text-primary">{v as string}</span>
                  </div>
                ))}
              </dd>
            </div>
          )}
        </div>
      </div>

      {/* Add credential dialog ───────────────────────────────── */}
      {credOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCredOpen(false);
              resetCredForm();
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Add credential
                </h3>
                <p className="mt-0.5 text-xs text-text-muted">
                  Encrypted at rest with AES-256-GCM. Only the vault
                  owner's agents can decrypt it at run time.
                </p>
              </div>
              <button
                onClick={() => {
                  setCredOpen(false);
                  resetCredForm();
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
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                placeholder="e.g. SLACK_BOT_TOKEN"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Value
              </span>
              <input
                type="password"
                value={credValue}
                onChange={(e) => setCredValue(e.target.value)}
                placeholder="Paste the secret…"
                className="mt-1 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCredential();
                }}
              />
            </label>

            {credError && (
              <p className="mt-3 text-xs text-red-600">{credError}</p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCredOpen(false);
                  resetCredForm();
                }}
                disabled={credSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateCredential}
                disabled={credSaving || !credName.trim() || !credValue}
              >
                {credSaving ? "Saving…" : "Save credential"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
