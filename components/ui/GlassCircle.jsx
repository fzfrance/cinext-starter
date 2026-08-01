export default function GlassCircle({ children, onClick, t }) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition flex-shrink-0"
      style={{
        background: t.cardFill,
        border: `1px solid ${t.glassBorder}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {children}
    </button>
  );
}
