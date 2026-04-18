import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root não encontrado");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
