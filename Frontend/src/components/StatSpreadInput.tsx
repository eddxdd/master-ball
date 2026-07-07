import { Input } from "@/components/ui/input";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

export function StatSpreadInput({
  label,
  values,
  defaultValue,
  max,
  onChange,
}: {
  label: string;
  values: Record<string, number>;
  defaultValue: number;
  max: number;
  onChange: (values: Record<string, number>) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="grid grid-cols-6 gap-1">
        {STAT_KEYS.map((key) => (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <span className="text-muted-foreground text-xs uppercase">{key}</span>
            <Input
              type="number"
              min={0}
              max={max}
              className="h-7 px-1 text-center text-xs"
              value={values[key] ?? defaultValue}
              onChange={(e) => {
                const raw = Number(e.target.value);
                const clamped = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(max, raw));
                onChange({ ...values, [key]: clamped });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
