"use client";
import Icon from "@/components/ui/Icon";
export default function InProgressViewToggle({ mode, onChange }) {
  return (
    <div role="group" aria-label="In Progress view" className="flex items-center rounded-full flex-shrink-0" style={{ padding: 3, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
      {[["grid", "gridToggle", "Poster view"], ["gallery", "list", "Episode card view"]].map(([value, icon, label]) => (
        <button key={value} type="button" aria-label={label} aria-pressed={mode === value} onClick={() => onChange(value)} className="flex items-center justify-center rounded-full transition" style={{ width: 34, height: 34, background: mode === value ? "#fff" : "transparent" }}>
          <Icon name={icon} size={15} color={mode === value ? "#111" : "rgba(255,255,255,0.6)"} />
        </button>
      ))}
    </div>
  );
}
