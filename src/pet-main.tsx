import React from "react"
import ReactDOM from "react-dom/client"
import { PetWindow } from "./components/pet/PetWindow"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PetWindow />
  </React.StrictMode>,
)
