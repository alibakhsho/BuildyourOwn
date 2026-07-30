import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/tailwind.css";
import { applyTheme, initialTheme } from "./design/theme.js";

// Applied before the first paint so a dark-mode user never sees a white flash.
applyTheme(initialTheme());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
