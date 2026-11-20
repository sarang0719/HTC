import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress benign ResizeObserver notifications from iframe and chart canvases
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (
      e.message?.includes("ResizeObserver loop") ||
      e.message?.includes("ResizeObserver")
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
}

createRoot(document.getElementById("root")!).render(<App />);
