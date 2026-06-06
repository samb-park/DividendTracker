"use client";

import { useState } from "react";
import {
  POCKET_GROUP_COLORS,
  POCKET_GROUP_ICONS,
  type Basis,
  type PocketGroup,
  type TickerAgg,
} from "@/lib/pocket-types";
import { TickerPicker } from "./ticker-picker";

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
    icon: string | null;
    accounts: string[];
    tickers: string[];
  }) => Promise<{ group: PocketGroup | null; error: string | null }>;
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      color?: string | null;
      icon?: string | null;
      accounts?: string[];
      tickers?: string[];
    }
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
  const [draftIcon, setDraftIcon] = useState<string | null>(null);
  const [draftAccounts, setDraftAccounts] = useState<Set<string>>(new Set());
  const [draftTickers, setDraftTickers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const editing = editingId !== null;

  const startNew = () => {
    setEditingId(NEW);
    setDraftName("");
    setDraftColor(POCKET_GROUP_COLORS[0]);
    setDraftIcon(null);
    setDraftAccounts(new Set());
    setDraftTickers(new Set());
    setErr(null);
  };
  const startEdit = (g: PocketGroup) => {
    setEditingId(g.id);
    setDraftName(g.name);
    setDraftColor(g.color ?? POCKET_GROUP_COLORS[0]);
    setDraftIcon(g.icon ?? null);
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
        icon: draftIcon,
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
    g.accounts.length === 0
      ? "전체 계좌"
      : g.accounts.map((a) => ACCT_LABELS[a] ?? a).join(" · ");

  return (
    <>
      <div className="pk-sheet-scrim" onClick={editing ? backToList : onClose} />
      <div className="pk-sheet" role="dialog" aria-modal="true" aria-label="포트폴리오 관리">
        <div className="pk-sheet-grip" />

        {!editing ? (
          <>
            <div className="pk-sheet-head">
              <span className="pk-sheet-title">포트폴리오</span>
              <button type="button" className="pk-sheet-done" onClick={onClose}>
                Done
              </button>
            </div>

            <div className="pk-section-label">Portfolios</div>
            {loading && groups.length === 0 ? (
              <p className="pk-note">불러오는 중…</p>
            ) : groups.length === 0 ? (
              <p className="pk-note">아직 포트폴리오가 없습니다. 아래에서 새로 만들어 보세요.</p>
            ) : (
              <div className="pk-picker">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className="pk-picker-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => startEdit(g)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        startEdit(g);
                      }
                    }}
                  >
                    <span className="pk-pfsel-mark" aria-hidden>
                      {g.icon ? (
                        <span className="pk-pfsel-emoji">{g.icon}</span>
                      ) : (
                        <span className="pk-dot" style={{ background: g.color || "var(--pk-muted)" }} />
                      )}
                    </span>
                    <div className="pk-picker-main">
                      <span className="pk-picker-ticker">{g.name}</span>
                      <span className="pk-picker-sub">
                        {acctSummary(g)} · {g.tickers.length} 종목
                      </span>
                    </div>
                    <span className="pk-gm-chevron" aria-hidden>
                      ›
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button type="button" className="pk-action" onClick={startNew}>
              ＋ 새 포트폴리오
            </button>
          </>
        ) : (
          <>
            <div className="pk-sheet-head">
              <button type="button" className="pk-sheet-done" onClick={backToList}>
                ‹ Back
              </button>
              <button
                type="button"
                className="pk-sheet-done"
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
              placeholder="이름 (예: A)"
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={40}
              autoFocus
            />

            {err && <p className="pk-note warn">{err}</p>}

            {accountTypes.length > 0 && (
              <section>
                <div className="pk-section-label">Accounts</div>
                <div className="pk-chips" role="group" aria-label="계좌">
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
                {draftAccounts.size === 0 && (
                  <p className="pk-note">선택 안 하면 전체 계좌예요.</p>
                )}
              </section>
            )}

            <section>
              <div className="pk-section-label">Color</div>
              <div className="pk-swatches" role="group" aria-label="색상">
                {POCKET_GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="pk-swatch"
                    data-active={draftColor === c}
                    style={{ background: c }}
                    aria-label={c}
                    aria-pressed={draftColor === c}
                    onClick={() => setDraftColor(c)}
                  />
                ))}
              </div>
            </section>

            <section>
              <div className="pk-section-label">Icon</div>
              <div className="pk-iconpick" role="group" aria-label="아이콘">
                <button
                  type="button"
                  className="pk-iconbtn"
                  data-active={draftIcon === null}
                  onClick={() => setDraftIcon(null)}
                >
                  없음
                </button>
                {POCKET_GROUP_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className="pk-iconbtn"
                    data-active={draftIcon === ic}
                    aria-pressed={draftIcon === ic}
                    onClick={() => setDraftIcon(ic)}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </section>

            <div className="pk-section-label">종목 {draftTickers.size}개 선택</div>
            <TickerPicker
              tickers={allTickers}
              selected={draftTickers}
              basis={basis}
              onToggle={toggleTicker}
            />

            {editingId !== NEW && (
              <button type="button" className="pk-danger" onClick={remove} disabled={saving}>
                이 포트폴리오 삭제
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
