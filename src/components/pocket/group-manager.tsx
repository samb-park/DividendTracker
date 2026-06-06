"use client";

import { useState } from "react";
import {
  POCKET_GROUP_COLORS,
  POCKET_GROUP_ICONS,
  type Basis,
  type PocketGroup,
  type TickerAgg,
} from "@/lib/pocket-types";
import { AccountChips } from "./account-chips";
import { TickerPicker } from "./ticker-picker";

interface Props {
  groups: PocketGroup[];
  allTickers: TickerAgg[]; // every held ticker, for membership editing
  basis: Basis;
  accountTypes: string[];
  excludedAccounts: Set<string>;
  onToggleAccount: (a: string) => void;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    color: string | null;
    icon: string | null;
    tickers: string[];
  }) => Promise<PocketGroup | null>;
  onUpdate: (
    id: string,
    patch: { name?: string; color?: string | null; icon?: string | null; tickers?: string[] }
  ) => void;
  onDelete: (id: string) => void;
}

const NEW = "__new__";

export function GroupManager({
  groups,
  allTickers,
  basis,
  accountTypes,
  excludedAccounts,
  onToggleAccount,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<string | null>(POCKET_GROUP_COLORS[0]);
  const [draftIcon, setDraftIcon] = useState<string | null>(null);
  const [draftTickers, setDraftTickers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const editing = editingId !== null;

  const startNew = () => {
    setEditingId(NEW);
    setDraftName("");
    setDraftColor(POCKET_GROUP_COLORS[0]);
    setDraftIcon(null);
    setDraftTickers(new Set());
  };
  const startEdit = (g: PocketGroup) => {
    setEditingId(g.id);
    setDraftName(g.name);
    setDraftColor(g.color ?? POCKET_GROUP_COLORS[0]);
    setDraftIcon(g.icon ?? null);
    setDraftTickers(new Set(g.tickers));
  };
  const backToList = () => setEditingId(null);

  const toggleTicker = (ticker: string) => {
    setDraftTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const save = async () => {
    const name = draftName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const payload = { name, color: draftColor, icon: draftIcon, tickers: [...draftTickers] };
      if (editingId === NEW) await onCreate(payload);
      else if (editingId) onUpdate(editingId, payload);
      backToList();
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (editingId && editingId !== NEW) onDelete(editingId);
    backToList();
  };

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

            {accountTypes.length > 1 && (
              <section>
                <div className="pk-section-label">Accounts</div>
                <AccountChips
                  accountTypes={accountTypes}
                  excluded={excludedAccounts}
                  onToggle={onToggleAccount}
                />
              </section>
            )}

            <div className="pk-section-label">Portfolios</div>
            {groups.length === 0 ? (
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
                    </div>
                    <span className="pk-picker-sub">{g.tickers.length} 종목</span>
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
              <button type="button" className="pk-danger" onClick={remove}>
                이 포트폴리오 삭제
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
