/* A labelled control. The <label> wraps its input so clicking the text
   focuses the field without needing matching id/htmlFor pairs. */
export default function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span className="ec-label">{label}</span>
      {children}
    </label>
  );
}
