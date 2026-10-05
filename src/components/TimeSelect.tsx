import { hhmm } from "../lib/planningTime";

/** Selector de hora en formato 24 h (los `input type="time"` muestran AM/PM según el sistema). */
export default function TimeSelect({
  value,
  onChange,
  label,
  className,
}: {
  value: number;
  onChange(minutes: number): void;
  label: string;
  className?: string;
}) {
  const options = Array.from({ length: 48 }, (_, i) => i * 30);
  if (!options.includes(value)) options.push(value);
  options.sort((a, b) => a - b);
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className={className}>
      {options.map((m) => (
        <option key={m} value={m}>
          {hhmm(m)}
        </option>
      ))}
    </select>
  );
}
