// Must be the first import: it migrates legacy "snotra-" localStorage keys
// before any zustand store (which reads them at create()) gets evaluated.
import "./utils/legacyStorage";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "./i18n";
import { installPiServerFetchInterceptor } from "./utils/piClient";

installPiServerFetchInterceptor();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
