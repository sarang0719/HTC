import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress benign ResizeObserver and network reconnection noise in Safari/Chrome
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    const msg = e.message || (e.error ? e.error.message : "") || "";
    if (
      msg.includes("ResizeObserver") ||
      msg.includes("ResizeObserver loop") ||
      msg.includes("network connection was lost") ||
      msg.includes("pushstream")
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }
  }, true);

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason ? (e.reason.message || String(e.reason)) : "";
    if (
      reason.includes("ResizeObserver") ||
      reason.includes("network connection was lost") ||
      reason.includes("pushstream")
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
}

createRoot(document.getElementById("root")!).render(<App />);
