"use client";

import type { Basis, ThemePref, TickerAgg } from "@/lib/pocket-types";
import { TickerPicker } from "./ticker-picker";
import { AccountChips } from "./account-chips";

interface Props {
  tickers: TickerAgg[];
  excluded: Set<string>;
  onToggle: (ticker: string) => void;
  accountTypes: string[];
  excludedAccounts: Set<string>;
  onToggleAccount: (accountType: string) => void;
  basis: Basis;
  setBasis: (b: Basis) => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
}

const THEME_OPTS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "시스템" },
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
];

const BASIS_OPTS: { value: Basis; label: string }[] = [
  { value: "net", label: "세후" },
  { value: "gross", label: "세전" },
];

export function PocketSettings({
  tickers,
  excluded,
  onToggle,
  accountTypes,
  excludedAccounts,
  onToggleAccount,
  basis,
  setBasis,
  themePref,
  setThemePref,
}: Props) {
  return (
    <div className="pk-settings">
      <h1 className="pk-title">Settings</h1>

      {accountTypes.length > 1 && (
        <section>
          <div className="pk-section-label">계좌</div>
          <AccountChips accountTypes={accountTypes} excluded={excludedAccounts} onToggle={onToggleAccount} />
        </section>
      )}

      <section>
        <div className="pk-section-label">종목 선택</div>
        <TickerPicker tickers={tickers} excluded={excluded} basis={basis} onToggle={onToggle} />
      </section>

      <section>
        <div className="pk-section-label">금액 기준</div>
        <div className="pk-row-between">
          <span className="pk-field-label">{basis === "net" ? "세후 실수령" : "세전 명목"}</span>
          <div className="pk-seg" role="group" aria-label="금액 기준">
            {BASIS_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                className="pk-seg-btn"
                data-active={basis === o.value}
                onClick={() => setBasis(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="pk-section-label">테마</div>
        <div className="pk-seg" role="group" aria-label="테마">
          {THEME_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-seg-btn"
              data-active={themePref === o.value}
              onClick={() => setThemePref(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
