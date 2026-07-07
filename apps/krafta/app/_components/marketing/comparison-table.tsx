import { Check, Minus } from "lucide-react";

/**
 * comparison-table.tsx — the shared "Krafta vs <competitor>" matrix used on the
 * vs/* pages. Krafta's column is emphasized (foreground border); the competitor
 * column stays neutral. Cells are either a check/dash or a short label.
 */

export type CompCell = boolean | string;
export type CompRow = { label: string; krafta: CompCell; other: CompCell };

export function ComparisonTable({
  otherName,
  rows,
}: {
  otherName: string;
  rows: CompRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3 pr-4 text-left font-medium text-muted-foreground">
              &nbsp;
            </th>
            <th className="w-40 px-4 py-3 text-center font-semibold text-foreground">
              Krafta
            </th>
            <th className="w-40 px-4 py-3 text-center font-medium text-muted-foreground">
              {otherName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border">
              <td className="py-3 pr-4 text-foreground">{row.label}</td>
              <Cell value={row.krafta} emphasize />
              <Cell value={row.other} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value, emphasize }: { value: CompCell; emphasize?: boolean }) {
  return (
    <td className="px-4 py-3 text-center align-top">
      {value === true ? (
        <Check className="mx-auto size-4 text-foreground" aria-hidden />
      ) : value === false ? (
        <Minus className="mx-auto size-4 text-muted-foreground/50" aria-hidden />
      ) : (
        <span
          className={
            emphasize
              ? "text-xs font-medium text-foreground"
              : "text-xs text-muted-foreground"
          }
        >
          {value}
        </span>
      )}
    </td>
  );
}
