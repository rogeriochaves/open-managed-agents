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

type StatusFilter = "all" | "active";

export function EnvironmentsListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [afterId, setAfterId] = useState<string | undefined>();
  const [cursorStack, setCursorStack] = useState<string[]>([]);

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
        <Button variant="primary">
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
    </div>
  );
}
