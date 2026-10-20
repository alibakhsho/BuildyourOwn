import React from "react";
import ReactDOM from "react-dom/client";
import "./src/styles/tailwind.css";
import BuildRequirements from "./src/components/BuildRequirements.jsx";
ReactDOM.createRoot(document.getElementById("root")).render(<BuildRequirements floors={2} currency="A$" />);
