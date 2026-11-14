import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { injectAnalyticsBeacon } from "./analytics";
import { App } from "./App";
import { WalletClientProvider } from "./components/wallet/WalletClient";
import { useWallet } from "./lib/wallet";
import { initMonitoring } from "./monitoring";
import "./styles/index.css";

initMonitoring();
injectAnalyticsBeacon(import.meta.env.VITE_CF_ANALYTICS_TOKEN);

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

/** Real wallet client (the context default is the same; the demo and the tests swap it inside). */
const walletClient = { useWallet };

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <WalletClientProvider client={walletClient}>
        <App />
      </WalletClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
