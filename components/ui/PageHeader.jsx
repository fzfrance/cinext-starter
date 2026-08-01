import GlassCircle from "./GlassCircle";
import Icon from "./Icon";

export default function PageHeader({ title, onBack, t }) {
  return (
    <div className="px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <GlassCircle onClick={onBack} t={t}>
        <Icon name="back" size={16} color={t.text} />
      </GlassCircle>
      <div style={{ fontSize: 26, fontWeight: 800, color: t.text, marginTop: 16 }}>{title}</div>
    </div>
  );
}
