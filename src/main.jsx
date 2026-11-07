import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import TheVanApp from "./App.jsx";
import { registerServiceWorker } from "./pwa.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TheVanApp />
    <Analytics />
  </React.StrictMode>
);

registerServiceWorker();
