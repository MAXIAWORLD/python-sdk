import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useDebounced, type Params } from "./hooks";

/**
 * State of a list page — search, filters, sort, pagination and selection —
 * with filters mirrored in the URL (so links like /invoices?status=overdue work).
 */
export function useListState({ filters: filterKeys = [], defaultSort, pageSize = 50 }: { filters?: string[]; defaultSort?: string; pageSize?: number } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debouncedQ = useDebounced(q, 250);
  const [sort, setSort] = useState(searchParams.get("sort") ?? defaultSort ?? "");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of filterKeys) {
      const v = searchParams.get(k);
      if (v !== null && v !== "") out[k] = v;
    }
    return out;
  }, [searchParams, filterKeys.join(",")]);

  const setFilter = useCallback(
    (key: string, value: string | number | null | undefined) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === undefined || value === "") next.delete(key);
          else next.set(key, String(value));
          return next;
        },
        { replace: true },
      );
      setPage(0);
      setSelected([]);
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of filterKeys) next.delete(k);
        return next;
      },
      { replace: true },
    );
    setQ("");
    setPage(0);
  }, [setSearchParams, filterKeys.join(",")]);

  const params: Params = useMemo(
    () => ({ ...filters, q: debouncedQ || undefined, sort: sort || undefined, limit: pageSize, offset: page * pageSize }),
    [filters, debouncedQ, sort, page, pageSize],
  );

  return {
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(0);
    },
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    filters,
    setFilter,
    clearFilters,
    activeFilterCount: Object.keys(filters).length + (debouncedQ ? 1 : 0),
    params,
    selected,
    setSelected,
    clearSelection: () => setSelected([]),
  };
}
