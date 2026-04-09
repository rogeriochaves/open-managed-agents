import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
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

const DATE_FILTERS = [
  { label: "All time", value: "" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
] as const;

function dateFilterToParam(value: string): string | undefined {
  if (!value) return undefined;
  const now = new Date();
  const ms =
    value === "24h"
      ? 86400000
      : value === "7d"
        ? 604800000
        : 2592000000;
  return new Date(now.getTime() - ms).toISOString();
}

export function AgentsListPage() {
  const navigate = useNavigate();
  const [goToId, setGoToId] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [afterId, setAfterId] = useState<string | undefined>();
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["agents", dateFilter, showArchived, afterId],
    queryFn: () =>
      api.listAgents({
        "created_at[gte]": dateFilterToParam(dateFilter),
        include_archived: showArchived || undefined,
        after_id: afterId,
        limit: 20,
      }),
  });

  const agents = data?.data ?? [];
  const hasMore = data?.has_more ?? false;

  const handleGoToId = () => {
    const id = goToId.trim();
    if (id) navigate(`/agents/${id}`);
  };

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
          <h1 className="text-2xl font-semibold text-text-primary">Agents</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Create and manage autonomous agents.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate("/quickstart")}>
          <Plus className="h-4 w-4" />
          New agent
        </Button>
      </div>

      {/* Filters bar */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={goToId}
          onChange={(e) => setGoToId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleGoToId();
          }}
          placeholder="Go to agent ID"
          className="rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
        />

        <select
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setAfterId(undefined);
            setCursorStack([]);
          }}
          className="rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none cursor-pointer"
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              setAfterId(undefined);
              setCursorStack([]);
            }}
            className="rounded border-surface-border bg-surface-secondary"
          />
          Show archived
        </label>
      </div>

      {/* Table */}
      <div className="mt-4">
        <Table>
          <TableHead>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>Model</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell>Created</TableHeadCell>
            <TableHeadCell>Last updated</TableHeadCell>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableEmpty colSpan={5} title="Loading agents..." />
            ) : agents.length === 0 ? (
              <TableEmpty
                colSpan={5}
                title="No agents yet"
                description={
                  <a
                    href="/quickstart"
                    className="text-accent-blue hover:underline"
                  >
                    Get started with agents
                  </a>
                }
              />
            ) : (
              agents.map((agent) => {
                const status = agent.archived_at ? "archived" : "active";
                return (
                  <TableRow
                    key={agent.id}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                  >
                    <TableCell>
                      <span className="font-medium">{agent.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary text-xs">
                        {agent.model.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(status)}>{status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary text-xs">
                        {new Date(agent.created_at).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary text-xs">
                        {new Date(agent.updated_at).toLocaleDateString()}
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
    </div>
  );
}
