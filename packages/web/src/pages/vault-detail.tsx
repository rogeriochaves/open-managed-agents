import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Plus, Key, Shield } from "lucide-react";
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
          </h3>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add credential
          </Button>
        </div>

        <div className="mt-4">
          <Table>
            <TableHead>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Type</TableHeadCell>
              <TableHeadCell>MCP Server</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell>Created</TableHeadCell>
            </TableHead>
            <TableBody>
              <TableEmpty
                colSpan={5}
                title="No credentials yet"
                description="Add credentials to give your agents access to MCP servers and tools."
              />
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
    </div>
  );
}
