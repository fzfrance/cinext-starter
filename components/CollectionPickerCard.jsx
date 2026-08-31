import Icon from "@/components/ui/Icon";
import CollectionBoxSet from "@/components/CollectionBoxSet";

export default function CollectionPickerCard({ collection, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-2xl overflow-hidden active:scale-[0.98] transition text-left flex-shrink-0"
      style={{ height: 88, background: "#100e0b", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <CollectionBoxSet shows={collection.covers ?? []} width={13} centerX="72%" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,8,7,0.98) 0%, rgba(10,8,7,0.86) 42%, rgba(10,8,7,0.12) 78%, rgba(10,8,7,0.2) 100%)" }} />
      <div className="absolute left-4" style={{ bottom: 12, maxWidth: "56%" }}>
        <div className="truncate" style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{collection.name}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
          {collection.count} title{collection.count === 1 ? "" : "s"}
        </div>
      </div>
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          top: 12,
          right: 12,
          width: 26,
          height: 26,
          background: collection.inShow ? accent : "rgba(0,0,0,0.55)",
          border: collection.inShow ? "none" : "1.5px solid rgba(255,255,255,0.55)",
          zIndex: 2,
        }}
      >
        {collection.inShow && <Icon name="check" size={13} color="#1a1108" strokeWidth={2.8} />}
      </div>
    </button>
  );
}
