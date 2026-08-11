/* Two equal columns — the standard pairing for related inputs (width/length,
   floors/height) in the left rail. */
export default function InputRow({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>{children}</div>;
}
