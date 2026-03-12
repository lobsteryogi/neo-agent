import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { KANBAN_COLUMNS, type KanbanTask, type TaskStatus } from '@neo-agent/shared';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Trash2, RotateCcw, Search, X } from 'lucide-react';
import KanbanColumn from './KanbanColumn';
import TaskCard from './TaskCard';
import TaskCreateForm from './TaskCreateForm';
import { useTaskStore } from '../stores/task-store';
import { Button } from './ui/button';
import { Input } from './ui/input';

const STATUS_IDS = new Set(KANBAN_COLUMNS.map((c) => c.id as string));

export default function KanbanBoard() {
  const tasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.moveTask);
  const selectedTaskIds = useTaskStore((s) => s.selectedTaskIds);
  const clearSelection = useTaskStore((s) => s.clearSelection);
  const bulkDelete = useTaskStore((s) => s.bulkDelete);
  const bulkRequeue = useTaskStore((s) => s.bulkRequeue);
  const searchQuery = useTaskStore((s) => s.searchQuery);
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery);
  const selectTask = useTaskStore((s) => s.selectTask);

  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [collapsedCols, setCollapsedCols] = useState<Set<TaskStatus>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (showCreate) {
          setShowCreate(false);
          return;
        }
        selectTask(null);
        clearSelection();
        setSearchQuery('');
        return;
      }

      if (!isInput) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setShowCreate(true);
          return;
        }
        if (e.key === '/') {
          e.preventDefault();
          searchRef.current?.focus();
          return;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, selectTask, clearSelection, setSearchQuery]);

  const q = searchQuery.toLowerCase().trim();

  const columnTasks = useMemo(() => {
    const map = new Map<TaskStatus, KanbanTask[]>();
    for (const col of KANBAN_COLUMNS) {
      let colTasks = tasks
        .filter((t) => t.status === col.id)
        .sort((a, b) => a.position - b.position);
      if (q) {
        colTasks = colTasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.labels.some((l) => l.toLowerCase().includes(q)),
        );
      }
      map.set(col.id, colTasks);
    }
    return map;
  }, [tasks, q]);

  const findContainer = useCallback(
    (id: string): TaskStatus | undefined => {
      if (STATUS_IDS.has(id)) return id as TaskStatus;
      return tasks.find((t) => t.id === id)?.status;
    },
    [tasks],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const sourceStatus = findContainer(activeId);
    let destStatus = findContainer(overId);
    if (STATUS_IDS.has(overId)) destStatus = overId as TaskStatus;
    if (!sourceStatus || !destStatus) return;
    const destTasks = columnTasks.get(destStatus) ?? [];
    if (sourceStatus === destStatus && activeId === overId) return;
    let newPosition: number;
    if (sourceStatus === destStatus) {
      const oldIndex = destTasks.findIndex((t) => t.id === activeId);
      const newIndex = destTasks.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(destTasks, oldIndex, newIndex);
      const targetIdx = reordered.findIndex((t) => t.id === activeId);
      const prev = reordered[targetIdx - 1]?.position ?? 0;
      const next = reordered[targetIdx + 1]?.position ?? prev + 2;
      newPosition = (prev + next) / 2;
    } else {
      const overIndex = destTasks.findIndex((t) => t.id === overId);
      if (overIndex === -1) {
        newPosition = destTasks.length > 0 ? destTasks[destTasks.length - 1].position + 1 : 1;
      } else {
        const prev = destTasks[overIndex - 1]?.position ?? 0;
        const curr = destTasks[overIndex].position;
        newPosition = (prev + curr) / 2;
      }
    }
    moveTask(activeId, destStatus, newPosition);
  }

  function toggleCollapse(colId: TaskStatus) {
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      next.has(colId) ? next.delete(colId) : next.add(colId);
      return next;
    });
  }

  return (
    <>
      {showCreate && <TaskCreateForm onClose={() => setShowCreate(false)} />}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks… (/)"
            className="pl-8 h-8 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground/50 ml-1 hidden sm:block">
          N new · / search · Esc close
        </div>

        {/* Bulk actions — appear when items are selected */}
        {selectedTaskIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5">
            <span className="text-[11px] text-primary font-medium">
              {selectedTaskIds.size} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                bulkRequeue();
              }}
              title="Requeue to backlog"
            >
              <RotateCcw className="h-3 w-3" />
              Requeue
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 text-[11px] text-destructive hover:text-destructive"
              onClick={() => {
                bulkDelete();
              }}
              title="Delete selected"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
            <button
              onClick={clearSelection}
              className="text-muted-foreground hover:text-foreground ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 px-4 pb-4 pt-2 flex-1 overflow-x-auto items-start">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              label={col.label}
              tasks={columnTasks.get(col.id) ?? []}
              onAddClick={col.id === 'backlog' ? () => setShowCreate(true) : undefined}
              isCollapsed={collapsedCols.has(col.id)}
              onToggleCollapse={() => toggleCollapse(col.id)}
            />
          ))}
        </div>
        <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}
