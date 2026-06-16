"use client";

import { useEffect, useRef, useState } from "react";
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
import { ACCT_LABELS, POCKET_GROUP_COLORS, type Basis, type PocketGroup, type TickerAgg } from "@/lib/pocket-types";
import { TickerPicker } from "./ticker-picker";
import { PortfolioRow } from "./portfolio-row";
import { useSheetBack } from "./use-sheet-back";

/**
 * M2: when the iOS keyboard opens for the name field, the visual viewport
 * shrinks but the position:fixed sheet doesn't — its bottom half (Save area,
 * ticker list) ends up hidden behind the keyboard. Track visualViewport and
 * (a) cap the sheet's max-height to the VISIBLE height and (b) lift its bottom
 * above the keyboard, restoring both when the keyboard goes away.
 */
function useKeyboardSheetFit(sheetRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const el = sheetRef.current;
      if (!el) return;
      const obscured = window.innerHeight - vv.height - vv.offsetTop;
      if (obscured > 50) {
        // keyboard (or similar) is up
        el.style.bottom = `${obscured}px`;
        el.style.maxHeight = `${Math.max(160, vv.height - 10)}px`;
      } else {
        el.style.bottom = "";
        el.style.maxHeight = "";
      }
    };
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [sheetRef]);
}

interface Props {
  groups: PocketGroup[];
  loading: boolean; // groups still loading from the server
  allTickers: TickerAgg[]; // every held ticker, for membership editing
  basis: Basis;
  accountTypes: string[]; // account types the user actually holds
  onClose: () => void;
  onReorder: (orderedIds: string[]) => void; // persist drag-reordered group order
  onCreate: (input: {
    name: string;
    color: string | null;
    accounts: string[];
    tickers: string[];
  }) => Promise<{ group: PocketGroup | null; error: string | null }>;
  onUpdate: (
    id: string,
    patch: { name?: string; color?: string | null; accounts?: string[]; tickers?: string[] }
  ) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}

const NEW = "__new__";

/**
 * One reorderable portfolio row in the manage sheet. Drag listeners live on the
 * WRAPPER div (not the inner button) so a real tap still reaches PortfolioRow's
 * onClick → edit, while a long-press (TouchSensor delay) activates the drag. The
 * in-place row goes transparent while dragging — the DragOverlay is the only
 * visible "lifted" copy, so nothing double-renders.
 */
function SortableGroupRow({
  group,
  subtitle,
  onEdit,
}: {
  group: PocketGroup;
  subtitle: string;
  onEdit: (g: PocketGroup) => void;
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
    <div ref={setNodeRef} style={style} className="pk-sortable-row" {...attributes} {...listeners}>
      <PortfolioRow color={group.color} name={group.name} subtitle={subtitle} onClick={() => onEdit(group)} />
    </div>
  );
}

export function GroupManager({
  groups,
  loading,
  allTickers,
  basis,
  accountTypes,
  onClose,
  onReorder,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<string | null>(POCKET_GROUP_COLORS[0]);
  const [draftAccounts, setDraftAccounts] = useState<Set<string>>(new Set());
  const [draftTickers, setDraftTickers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [activeDrag, setActiveDrag] = useState<PocketGroup | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const editing = editingId !== null;
  useKeyboardSheetFit(sheetRef);

  // TouchSensor (long-press 200ms = pick up; its non-passive window touchmove is
  // what actually suppresses iOS scroll during a drag) + MouseSensor (desktop).
  // Deliberately NO PointerSensor: Pointer+Touch together races on iOS and the
  // pointermove-preventDefault path cannot stop iOS scroll → the sheet scrolls
  // under the lifted row. KeyboardSensor is wired for a11y.
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
    onReorder(arrayMove(groups, oldIndex, newIndex).map((g) => g.id));
  }

  // Play the slide-down/fade-out before actually unmounting (parent drops us on
  // onClose). 220ms matches the pk-slide-down / pk-fade-out keyframe duration.
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220);
  };
  useSheetBack(requestClose); // system back closes the sheet instead of leaving /pocket

  const startNew = () => {
    setEditingId(NEW);
    setDraftName("");
    setDraftColor(POCKET_GROUP_COLORS[0]);
    setDraftAccounts(new Set());
    setDraftTickers(new Set());
    setErr(null);
  };
  const startEdit = (g: PocketGroup) => {
    setEditingId(g.id);
    setDraftName(g.name);
    setDraftColor(g.color ?? POCKET_GROUP_COLORS[0]);
    setDraftAccounts(new Set(g.accounts));
    setDraftTickers(new Set(g.tickers));
    setErr(null);
  };
  const backToList = () => {
    setEditingId(null);
    setErr(null);
  };

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };
  const toggleAccount = toggleIn(setDraftAccounts);
  const toggleTicker = toggleIn(setDraftTickers);

  const save = async () => {
    const name = draftName.trim();
    if (!name || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name,
        color: draftColor,
        accounts: [...draftAccounts],
        tickers: [...draftTickers],
      };
      let res: { error: string | null };
      if (editingId === NEW) res = await onCreate(payload);
      else if (editingId) res = await onUpdate(editingId, payload);
      else return;
      if (res.error) {
        setErr(res.error);
        return; // keep the editor open so the user can fix it
      }
      backToList();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editingId || editingId === NEW || saving) {
      backToList();
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await onDelete(editingId);
      if (res.error) {
        setErr(res.error);
        return;
      }
      backToList();
    } finally {
      setSaving(false);
    }
  };

  const acctSummary = (g: PocketGroup) =>
    g.accounts.length === 0 ? "All accounts" : g.accounts.map((a) => ACCT_LABELS[a] ?? a).join(" · ");

  return (
    <>
      <div
        className="pk-sheet-scrim"
        data-closing={closing || undefined}
        onClick={editing ? backToList : requestClose}
      />
      <div
        ref={sheetRef}
        className="pk-sheet"
        data-closing={closing || undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Manage portfolios"
      >
        <div className="pk-sheet-grip" />

        {!editing ? (
          <>
            <div className="pk-sheet-head">
              <span className="pk-sheet-title">Portfolios</span>
              <button type="button" className="pk-textbtn" onClick={requestClose}>
                Done
              </button>
            </div>

            {loading && groups.length === 0 ? (
              <p className="pk-note">Loading…</p>
            ) : groups.length === 0 ? (
              <p className="pk-note">No portfolios yet. Create one below.</p>
            ) : (
              // Long-press a row to drag it into a new order; a plain tap edits it.
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setActiveDrag(null)}
              >
                <div className="pk-pf-list pk-card">
                  <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                    {groups.map((g) => (
                      <SortableGroupRow
                        key={g.id}
                        group={g}
                        subtitle={`${acctSummary(g)} · ${g.tickers.length} ticker${g.tickers.length === 1 ? "" : "s"}`}
                        onEdit={startEdit}
                      />
                    ))}
                  </SortableContext>
                </div>
                <DragOverlay>
                  {activeDrag ? (
                    <div className="pk-sortable-row pk-lifted">
                      <PortfolioRow
                        color={activeDrag.color}
                        name={activeDrag.name}
                        subtitle={`${acctSummary(activeDrag)} · ${activeDrag.tickers.length} ticker${
                          activeDrag.tickers.length === 1 ? "" : "s"
                        }`}
                        onClick={() => {}}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            {groups.length > 1 && <p className="pk-note">Tap to edit · hold to drag and reorder.</p>}

            <button type="button" className="pk-action" onClick={startNew}>
              + New portfolio
            </button>
          </>
        ) : (
          <>
            <div className="pk-sheet-head">
              <button type="button" className="pk-textbtn" onClick={backToList}>
                ‹ Back
              </button>
              <button
                type="button"
                className="pk-textbtn"
                onClick={save}
                disabled={!draftName.trim() || saving}
              >
                {editingId === NEW ? "Create" : "Save"}
              </button>
            </div>

            {/* No autoFocus (M2): on iOS it summoned the keyboard the instant the
                editor opened, hiding the bottom half of the sheet. The user taps
                the field when they actually want to type. */}
            <input
              className="pk-input"
              type="text"
              value={draftName}
              placeholder="Name (e.g. A)"
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={40}
            />

            {err && <p className="pk-note warn">{err}</p>}

            {accountTypes.length > 0 && (
              <section>
                <div className="pk-section-label">Accounts</div>
                <div className="pk-chips" role="group" aria-label="Accounts">
                  {accountTypes.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="pk-chip"
                      data-active={draftAccounts.has(a)}
                      aria-pressed={draftAccounts.has(a)}
                      onClick={() => toggleAccount(a)}
                    >
                      {ACCT_LABELS[a] ?? a}
                    </button>
                  ))}
                </div>
                {draftAccounts.size === 0 && <p className="pk-note">None selected = all accounts.</p>}
              </section>
            )}

            <section>
              <div className="pk-section-label">Color</div>
              <div className="pk-swatches" role="group" aria-label="Color">
                {POCKET_GROUP_COLORS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    className="pk-swatch"
                    data-active={draftColor === c}
                    style={{ background: c }}
                    aria-label={`Color ${i + 1}`}
                    aria-pressed={draftColor === c}
                    onClick={() => setDraftColor(c)}
                  />
                ))}
              </div>
            </section>

            <div className="pk-section-label">{draftTickers.size} tickers selected</div>
            <TickerPicker
              tickers={allTickers}
              selected={draftTickers}
              basis={basis}
              onToggle={toggleTicker}
            />

            {editingId !== NEW && (
              <button type="button" className="pk-danger" onClick={remove} disabled={saving}>
                Delete portfolio
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
