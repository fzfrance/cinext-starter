export default function Loading() {
  return (
    <div
      className="show-route-loading"
      style={{
        minHeight: "100dvh",
        background: "#08090a",
      }}
      aria-busy="true"
      aria-label="Loading"
    />
  );
}
