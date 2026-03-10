import { useState, useMemo, useCallback } from 'react';
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
import KanbanColumn from './KanbanColumn';
import TaskCard from './TaskCard';
import TaskCreateForm from './TaskCreateForm';
import { useTaskStore } from '../stores/task-store';

const STATUS_IDS = new Set(KANBAN_COLUMNS.map((c) => c.id as string));

export default function KanbanBoard() {
  const tasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.moveTask);
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Memoize sorted tasks per column — recomputed only when tasks change
  const columnTasks = useMemo(() => {
    const map = new Map<TaskStatus, KanbanTask[]>();
    for (const col of KANBAN_COLUMNS) {
      map.set(
        col.id,
        tasks.filter((t) => t.status === col.id).sort((a, b) => a.position - b.position),
      );
    }
    return map;
  }, [tasks]);

  const findContainer = useCallback(
    (id: string): TaskStatus | undefined => {
      if (STATUS_IDS.has(id)) return id as TaskStatus;
      return tasks.find((t) => t.id === id)?.status;
    },
    [tasks],
  );

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const sourceStatus = findContainer(activeId);
    let destStatus = findContainer(overId);

    // If dropped on column itself (empty column case)
    if (STATUS_IDS.has(overId)) {
      destStatus = overId as TaskStatus;
    }

    if (!sourceStatus || !destStatus) return;

    const destTasks = columnTasks.get(destStatus) ?? [];

    if (sourceStatus === destStatus && activeId === overId) return;

    // Calculate new position
    let newPosition: number;

    if (sourceStatus === destStatus) {
      // Same column reorder
      const oldIndex = destTasks.findIndex((t) => t.id === activeId);
      const newIndex = destTasks.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(destTasks, oldIndex, newIndex);
      const targetIdx = reordered.findIndex((t) => t.id === activeId);
      const prev = reordered[targetIdx - 1]?.position ?? 0;
      const next = reordered[targetIdx + 1]?.position ?? prev + 2;
      newPosition = (prev + next) / 2;
    } else {
      // Cross-column move
      const overIndex = destTasks.findIndex((t) => t.id === overId);
      if (overIndex === -1) {
        // Dropped on empty column or at end
        newPosition = destTasks.length > 0 ? destTasks[destTasks.length - 1].position + 1 : 1;
      } else {
        const prev = destTasks[overIndex - 1]?.position ?? 0;
        const curr = destTasks[overIndex].position;
        newPosition = (prev + curr) / 2;
      }
    }

    moveTask(activeId, destStatus, newPosition);
  }

  return (
    <>
      {showCreate && <TaskCreateForm onClose={() => setShowCreate(false)} />}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          style={{
            display: 'flex',
            gap: '12px',
            padding: '16px',
            flex: 1,
            overflowX: 'auto',
            alignItems: 'flex-start',
          }}
        >
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              label={col.label}
              tasks={columnTasks.get(col.id) ?? []}
              onAddClick={col.id === 'backlog' ? () => setShowCreate(true) : undefined}
            />
          ))}
        </div>
        <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}
