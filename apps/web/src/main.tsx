import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ApplicationStartup } from "./startup/ApplicationStartup";
import { WalletSessionProvider } from "./api/walletSession";
import "./wallet-session.css";
import { installFocusModality } from "./focusModality";
const disposeFocusModality = installFocusModality(document);
if (import.meta.hot) import.meta.hot.dispose(disposeFocusModality);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApplicationStartup><WalletSessionProvider><App /></WalletSessionProvider></ApplicationStartup>
  </StrictMode>,
);
