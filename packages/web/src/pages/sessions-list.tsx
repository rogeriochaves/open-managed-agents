import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Archive } from "lucide-react";
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

export function SessionsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [goToId, setGoToId] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [afterId, setAfterId] = useState<string | undefined>();
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", dateFilter, agentFilter, showArchived, afterId],
    queryFn: () =>
      api.listSessions({
        "created_at[gte]": dateFilterToParam(dateFilter),
        agent_id: agentFilter || undefined,
        include_archived: showArchived || undefined,
        after_id: afterId,
        limit: 20,
      }),
  });

  // Fetch agents for the agent filter dropdown
  const { data: agentsData } = useQuery({
    queryKey: ["agents-for-filter"],
    queryFn: () => api.listAgents({ limit: 100 }),
  });

  const sessions = data?.data ?? [];
  const hasMore = data?.has_more ?? false;

  const handleGoToId = () => {
    const id = goToId.trim();
    if (id) navigate(`/sessions/${id}`);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectAll(false);
      setSelected(new Set());
    } else {
      setSelectAll(true);
      setSelected(new Set(sessions.map((s) => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkArchive = async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !window.confirm(
        `Archive ${count} session${count === 1 ? "" : "s"}? Archived sessions stop appearing in the default list but their events are preserved.`,
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      // Fire sequentially to keep the error mode simple: the first
      // failure stops the batch so the user can retry the remainder.
      // Parallel Promise.all would swallow individual failures and
      // leave the selection in an inconsistent half-archived state.
      for (const id of selected) {
        await api.archiveSession(id);
      }
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setSelected(new Set());
      setSelectAll(false);
    } catch (err) {
      console.error("Bulk archive failed:", err);
    } finally {
      setArchiving(false);
    }
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
          <h1 className="text-2xl font-semibold text-text-primary">
            Sessions
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Trace and debug agent sessions — every turn, tool call, and token.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="secondary"
              onClick={handleBulkArchive}
              disabled={archiving}
            >
              <Archive className="h-4 w-4" />
              {archiving
                ? `Archiving ${selected.size}…`
                : `Archive ${selected.size} selected`}
            </Button>
          )}
          <Button variant="primary" onClick={() => navigate("/quickstart")}>
            <Plus className="h-4 w-4" />
            New session
          </Button>
        </div>
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
          placeholder="Go to session ID"
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

        <select
          value={agentFilter}
          onChange={(e) => {
            setAgentFilter(e.target.value);
            setAfterId(undefined);
            setCursorStack([]);
          }}
          className="rounded-md border border-surface-border bg-surface-secondary px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none cursor-pointer"
        >
          <option value="">All agents</option>
          {(agentsData?.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
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
            <TableHeadCell className="w-10">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={toggleSelectAll}
                aria-label="Select all rows"
                className="rounded border-surface-border bg-surface-secondary"
              />
            </TableHeadCell>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell>Agent</TableHeadCell>
            <TableHeadCell>Created</TableHeadCell>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableEmpty colSpan={5} title="Loading sessions..." />
            ) : sessions.length === 0 ? (
              <TableEmpty
                colSpan={5}
                title="No sessions yet"
                description="Sessions will appear here once created through the API."
              />
            ) : (
              sessions.map((session) => (
                <TableRow
                  key={session.id}
                  onClick={() => navigate(`/sessions/${session.id}`)}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(session.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(session.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-surface-border bg-surface-secondary"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {session.title ?? session.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(session.status)}>
                      {session.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary text-xs">
                      {session.agent.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-text-secondary text-xs">
                      {new Date(session.created_at).toLocaleDateString()}
                    </span>
                  </TableCell>
                </TableRow>
              ))
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
