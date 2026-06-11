import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initEngine } from "./engine/wasm";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Bootstrap failed: #root element not found in index.html");
}

async function bootstrap(root: HTMLElement): Promise<void> {
  try {
    await initEngine();
  } catch (err) {
    console.error("Bootstrap failed: could not initialize the WASM scoring engine:", err);
    root.textContent = "Failed to load the scoring engine. See the browser console for details.";
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap(rootEl);
