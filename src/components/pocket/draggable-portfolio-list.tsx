"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PocketGroup } from "@/lib/pocket-types";
import { PortfolioRow } from "./portfolio-row";

interface Props {
  groups: PocketGroup[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (orderedIds: string[]) => void;
}

/**
 * One reorderable group row. Drag listeners live on the WRAPPER div (not the
 * inner button) so a real tap still reaches PortfolioRow's onClick → select,
 * while a long-press (TouchSensor delay) activates the drag. The in-place row
 * goes transparent while dragging — the DragOverlay is the only visible "lifted"
 * copy, so nothing double-renders.
 */
function SortableRow({
  group,
  selected,
  onSelect,
}: {
  group: PocketGroup;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition, // FLIP slide for the displaced rows
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="pk-sortable-row"
      {...attributes}
      {...listeners}
    >
      <PortfolioRow
        color={group.color}
        name={group.name}
        count={group.tickers.length}
        selected={selected}
        asOption
        onClick={() => onSelect(group.id)}
      />
    </div>
  );
}

export function DraggablePortfolioList({ groups, activeId, onSelect, onReorder }: Props) {
  const [activeDrag, setActiveDrag] = useState<PocketGroup | null>(null);

  // TouchSensor (long-press 200ms = pick up; its non-passive window touchmove is
  // what actually suppresses iOS scroll during a drag) + MouseSensor (desktop).
  // Deliberately NO PointerSensor: Pointer+Touch together races on iOS and the
  // pointermove-preventDefault path cannot stop iOS scroll → page scrolls under
  // the lifted row. KeyboardSensor is wired for a11y (rows need focus to use it).
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 12 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragStart(e: DragStartEvent) {
    setActiveDrag(groups.find((g) => g.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(groups, oldIndex, newIndex);
    // Reordering must NOT change the active selection (which page the pager shows);
    // only the order changes. Tap-to-select is the only thing that moves activeId.
    onReorder(next.map((g) => g.id));
  }

  return (
    <div className="pk-pf-list" role="listbox" aria-label="Select portfolio">
      {/* "All" is pinned: rendered OUTSIDE SortableContext, so no group can ever
          be dropped above it and it never moves. */}
      <PortfolioRow
        color={null}
        name="All"
        selected={activeId === null}
        asOption
        onClick={() => onSelect(null)}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          {groups.map((g) => (
            <SortableRow key={g.id} group={g} selected={activeId === g.id} onSelect={onSelect} />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeDrag ? (
            <div className="pk-sortable-row pk-lifted">
              <PortfolioRow
                color={activeDrag.color}
                name={activeDrag.name}
                count={activeDrag.tickers.length}
                selected={activeId === activeDrag.id}
                asOption
                onClick={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
