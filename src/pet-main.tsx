// Must be the first import: migrates legacy "snotra-" localStorage keys
// before the pet store reads them at create().
import "./utils/legacyStorage"
import React from "react"
import ReactDOM from "react-dom/client"
import { PetWindow } from "./components/pet/PetWindow"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PetWindow />
  </React.StrictMode>,
)
