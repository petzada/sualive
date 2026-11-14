import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { injectAnalyticsBeacon } from "./analytics";
import { App } from "./App";
import { initMonitoring } from "./monitoring";
import "./styles/index.css";
import { texts } from "./texts";

initMonitoring();
injectAnalyticsBeacon(import.meta.env.VITE_CF_ANALYTICS_TOKEN);

const description = document.createElement("meta");
description.name = "description";
description.content = texts.meta.description;
document.head.append(description);

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
