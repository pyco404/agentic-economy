import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { WalletSessionProvider } from "./api/walletSession";
import "./wallet-session.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletSessionProvider><App /></WalletSessionProvider>
  </StrictMode>,
);
