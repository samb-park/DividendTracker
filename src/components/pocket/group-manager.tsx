"use client";

import { useState } from "react";
import { POCKET_GROUP_COLORS, type Basis, type PocketGroup, type TickerAgg } from "@/lib/pocket-types";
import { TickerPicker } from "./ticker-picker";
import { PortfolioRow } from "./portfolio-row";

const ACCT_LABELS: Record<string, string> = {
  TFSA: "TFSA",
  RRSP: "RRSP",
  FHSA: "FHSA",
  NON_REG: "Non-Reg",
  CASH: "Cash",
};

interface Props {
  groups: PocketGroup[];
  loading: boolean; // groups still loading from the server
  allTickers: TickerAgg[]; // every held ticker, for membership editing
  basis: Basis;
  accountTypes: string[]; // account types the user actually holds
  onClose: () => void;
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

export function GroupManager({
  groups,
  loading,
  allTickers,
  basis,
  accountTypes,
  onClose,
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

  const editing = editingId !== null;

  // Play the slide-down/fade-out before actually unmounting (parent drops us on
  // onClose). 220ms matches the pk-slide-down / pk-fade-out keyframe duration.
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220);
  };

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
              <div className="pk-pf-list">
                {groups.map((g) => (
                  <PortfolioRow
                    key={g.id}
                    color={g.color}
                    name={g.name}
                    subtitle={`${acctSummary(g)} · ${g.tickers.length} ticker${g.tickers.length === 1 ? "" : "s"}`}
                    onClick={() => startEdit(g)}
                  />
                ))}
              </div>
            )}

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

            <input
              className="pk-input"
              type="text"
              value={draftName}
              placeholder="Name (e.g. A)"
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={40}
              autoFocus
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
