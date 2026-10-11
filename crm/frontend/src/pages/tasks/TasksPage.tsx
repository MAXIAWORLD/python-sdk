import { Columns3, ListTodo, Plus, Rows3, SquareCheckBig, Sun } from "lucide-react";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data/DataTable";
import { FilterChip, PageHeader } from "@/components/data/blocks";
import { RecordDialog } from "@/components/entity/EntityForm";
import { Glass } from "@/components/glass/Glass";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, StatusBadge } from "@/components/ui/display";
import { EntitySelect } from "@/components/ui/entity-select";
import { SearchInput, Select } from "@/components/ui/fields";
import { Segmented } from "@/components/ui/tabs";
import { TaskBoard } from "@/components/work/TaskBoard";
import { DueChip, PriorityFlag, refColor, TaskIndicators } from "@/components/work/TaskCard";
import { TaskCheck } from "@/components/work/TaskCheck";
import { TaskFocus } from "@/components/work/TaskFocus";
import { TaskQuickAdd } from "@/components/work/TaskQuickAdd";
import { TaskSheet, useTaskParam } from "@/components/work/TaskSheet";
import { focusGroup, PRIORITY_COLOR } from "@/components/work/work-utils";
import { labelOf, PRIORITY, TASK_STATUS, TASK_TYPES } from "@/lib/constants";
import { plural } from "@/lib/format";
import { useList, useLocalStorage, useUpdate, type Params } from "@/lib/hooks";
import { useListState } from "@/lib/list-state";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

type View = "focus" | "board" | "list";
type State = "open" | "done" | "all";

const OPEN = "todo,in_progress,review";

const SORTS = [
  { value: "due_date", label: "Échéance" },
  { value: "-created_at", label: "Plus récentes" },
  { value: "title", label: "Titre (A → Z)" },
  { value: "-completed_at", label: "Terminées récemment" },
];

export default function TasksPage() {
  const me = useAuth((s) => s.user);
  const [view, setView] = useLocalStorage<View>("prisme-tasks-view", "focus");
  const ls = useListState({ filters: ["assignee", "priority", "type", "project_id", "state"], defaultSort: "due_date" });
  const [taskId, setTaskId] = useTaskParam();
  const [creating, setCreating] = useState(false);
  const [memberName, setMemberName] = useState<string | null>(null);
  const update = useUpdate("tasks", { silent: true });

  const assignee = ls.filters.assignee ?? "me";
  const assigneeId = assignee === "all" ? undefined : assignee === "me" ? me?.id : Number(assignee);
  const state = (ls.filters.state ?? "open") as State;
  const base: Params = { q: ls.params.q as string | undefined, assignee_id: assigneeId, priority: ls.filters.priority, type: ls.filters.type, project_id: ls.filters.project_id };

  const open = useList<Task>("tasks", { ...base, status__in: OPEN, sort: "due_date,position", limit: 500 });
  const done = useList<Task>("tasks", { ...base, status: "done", sort: "-completed_at", limit: 50 }, { enabled: view === "focus" });
  const board = useList<Task>("tasks", { ...base, status__in: `${OPEN},done`, sort: "position", limit: 500 }, { enabled: view === "board" });
  const list = useList<Task>("tasks", { ...base, ...(state === "open" ? { status__in: OPEN } : state === "done" ? { status__in: "done,cancelled" } : {}), sort: ls.sort, limit: ls.pageSize, offset: ls.page * ls.pageSize }, { enabled: view === "list" });

  const openTasks = open.data?.items ?? [];
  const overdue = openTasks.filter((t) => focusGroup(t) === "overdue").length;
  const dueToday = openTasks.filter((t) => focusGroup(t) === "today").length;

  const setAssignee = (value: string | null) => ls.setFilter("assignee", value === "me" ? null : value);

  const columns: Column<Task>[] = [
    { key: "check", header: "", width: "44px", cell: (t) => <TaskCheck done={t.status === "done"} ringColor={PRIORITY_COLOR[t.priority]} onToggle={() => update.mutate({ id: t.id, data: { status: t.status === "done" ? "todo" : "done" } })} /> },
    {
      key: "title",
      header: "Tâche",
      sortKey: "title",
      cell: (t) => (
        <div className="min-w-0">
          <div className={cn("flex items-center gap-1.5 font-medium", t.status === "done" && "text-fg-3 line-through")}>
            <span className="truncate">{t.title}</span>
            <PriorityFlag priority={t.priority} />
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-fg-3">
            {t.project && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: refColor(t.project) }} />
                <span className="truncate">{t.project.name}</span>
              </span>
            )}
            {(t.contact || t.company) && <span className="truncate">{t.contact?.name ?? t.company?.name}</span>}
            <TaskIndicators task={t} />
          </div>
        </div>
      ),
    },
    { key: "status", header: "Statut", sortKey: "status", cell: (t) => <StatusBadge options={TASK_STATUS} value={t.status} size="xs" /> },
    { key: "priority", header: "Priorité", hideOnMobile: true, cell: (t) => <StatusBadge options={PRIORITY} value={t.priority} size="xs" /> },
    { key: "due", header: "Échéance", sortKey: "due_date", hideOnMobile: true, cell: (t) => (t.due_date ? <DueChip task={t} /> : <span className="text-fg-3">—</span>) },
    { key: "type", header: "Type", sortKey: "type", hideOnMobile: true, cell: (t) => <span className="text-[13px] text-fg-2">{labelOf(TASK_TYPES, t.type)}</span> },
    { key: "assignee", header: "Assignée", hideOnMobile: true, cell: (t) => (t.assignee ? <Avatar name={t.assignee.name} color={(t.assignee.color as string) ?? undefined} size={24} /> : <span className="text-fg-3">—</span>) },
  ];

  const filtered = ls.activeFilterCount > (ls.filters.state ? 1 : 0);
  const emptyList = (
    <EmptyState
      icon={<ListTodo className="size-6" />}
      title={filtered ? "Aucune tâche ne correspond" : state === "done" ? "Aucune tâche terminée" : "Aucune tâche ouverte"}
      description={filtered ? "Essayez d'élargir votre recherche ou vos filtres." : "Ajoutez une tâche avec la barre ci-dessus."}
      action={filtered ? <Button onClick={ls.clearFilters}>Réinitialiser les filtres</Button> : undefined}
    />
  );

  return (
    <div>
      <PageHeader
        title="Tâches"
        icon={<SquareCheckBig className="size-5" />}
        description={
          open.data ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{plural(open.data.total, "tâche ouverte", "tâches ouvertes")}</span>
              {overdue > 0 && (
                <span>
                  <b className="font-semibold text-red-500 tabular">{overdue}</b> en retard
                </span>
              )}
              <span>
                <b className="font-semibold text-fg tabular">{dueToday}</b> pour aujourd'hui
              </span>
            </span>
          ) : (
            "Chargement…"
          )
        }
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "focus", label: <span className="flex items-center gap-1.5"><Sun className="size-4" />Ma journée</span> },
                { value: "board", label: <span className="flex items-center gap-1.5"><Columns3 className="size-4" />Kanban</span> },
                { value: "list", label: <span className="flex items-center gap-1.5"><Rows3 className="size-4" />Liste</span> },
              ]}
            />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvelle tâche
            </Button>
          </>
        }
      />

      <div className="mb-4 space-y-3">
        <TaskQuickAdd defaults={{ assignee_id: assigneeId ?? me?.id, assignee_name: assignee === "me" || assignee === "all" ? me?.name : memberName, project_id: ls.filters.project_id ? Number(ls.filters.project_id) : null }} />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Rechercher une tâche…" className="w-full sm:w-[230px]" />
          <div className="flex items-center gap-1.5">
            <FilterChip active={assignee === "me"} onClick={() => setAssignee("me")}>
              Mes tâches
            </FilterChip>
            <FilterChip active={assignee === "all"} onClick={() => setAssignee("all")}>
              Équipe
            </FilterChip>
            <EntitySelect
              resource="users"
              value={assignee !== "me" && assignee !== "all" ? Number(assignee) : null}
              initialLabel={memberName}
              onChange={(id, row) => {
                setMemberName(row ? String(row.name ?? "") : null);
                setAssignee(id ? String(id) : "me");
              }}
              placeholder="Un membre…"
              className="h-8 w-[150px] rounded-full text-[12.5px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Select options={[{ value: "", label: "Toutes priorités" }, ...PRIORITY]} value={ls.filters.priority ?? ""} onChange={(v) => ls.setFilter("priority", v)} className="w-[162px]" />
            <Select options={[{ value: "", label: "Tous types" }, ...TASK_TYPES]} value={ls.filters.type ?? ""} onChange={(v) => ls.setFilter("type", v)} className="w-[132px]" />
            <EntitySelect resource="projects" value={ls.filters.project_id ? Number(ls.filters.project_id) : null} onChange={(id) => ls.setFilter("project_id", id)} placeholder="Tous les projets" className="w-[175px]" />
          </div>
        </div>
      </div>

      {view === "focus" && <TaskFocus open={openTasks} done={done.data?.items ?? []} loading={open.isLoading} showAssignee={assignee !== "me"} onOpen={(t) => setTaskId(t.id)} />}

      {view === "board" && <TaskBoard tasks={board.data?.items ?? []} loading={board.isLoading} onOpen={(t) => setTaskId(t.id)} createDefaults={{ assignee_id: assigneeId ?? me?.id, ...(ls.filters.project_id ? { project_id: Number(ls.filters.project_id) } : {}) }} />}

      {view === "list" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["open", "Ouvertes"],
                ["done", "Terminées"],
                ["all", "Toutes"],
              ] as const
            ).map(([value, label]) => (
              <FilterChip key={value} active={state === value} onClick={() => ls.setFilter("state", value === "open" ? null : value)}>
                {label}
              </FilterChip>
            ))}
            <Select options={SORTS} value={ls.sort} onChange={ls.setSort} className="ml-auto w-[200px]" />
          </div>
          <Glass className="overflow-hidden" radius="lg">
            <DataTable columns={columns} rows={list.data?.items ?? []} loading={list.isLoading} sort={ls.sort} onSortChange={ls.setSort} onRowClick={(t) => setTaskId(t.id)} empty={emptyList} page={ls.page} pageSize={ls.pageSize} total={list.data?.total} onPageChange={ls.setPage} />
          </Glass>
        </div>
      )}

      <RecordDialog resource="tasks" open={creating} onOpenChange={setCreating} initial={{ assignee_id: me?.id, ...(ls.filters.project_id ? { project_id: Number(ls.filters.project_id) } : {}) }} labels={{ assignee_id: me?.name }} />
      <TaskSheet taskId={taskId} onClose={() => setTaskId(null)} />
    </div>
  );
}
