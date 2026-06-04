"use client";

const LABELS: Record<string, string> = {
  TFSA: "TFSA",
  RRSP: "RRSP",
  FHSA: "FHSA",
  NON_REG: "비등록",
  CASH: "현금",
};

interface Props {
  accountTypes: string[];
  excluded: Set<string>;
  onToggle: (accountType: string) => void;
}

export function AccountChips({ accountTypes, excluded, onToggle }: Props) {
  // No filter to offer when the user holds a single account type.
  if (accountTypes.length <= 1) return null;

  return (
    <div className="pk-chips" role="group" aria-label="계좌 선택">
      {accountTypes.map((a) => (
        <button
          key={a}
          type="button"
          className="pk-chip"
          data-active={!excluded.has(a)}
          aria-pressed={!excluded.has(a)}
          onClick={() => onToggle(a)}
        >
          {LABELS[a] ?? a}
        </button>
      ))}
    </div>
  );
}
