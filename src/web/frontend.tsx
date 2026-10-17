import "./runtime";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// NOTE: reuse the root across hot reloads.
// see https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
(import.meta.hot.data.root ??= createRoot(root)).render(app);
