import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// Initialize Neutralinojs if available (desktop mode)
if (typeof Neutralino !== "undefined") {
  Neutralino.init();

  // Graceful exit on window close
  Neutralino.events.on("windowClose", () => {
    Neutralino.app.exit();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
