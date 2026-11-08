import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../../web/tokens.css";
import "./phone.css";
import "./controls.css";
import { upgradeBrowserDrafts } from "./chat/browserUpgrade";
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
void upgradeBrowserDrafts().then((migrationNotice) =>
  createRoot(root).render(<App migrationNotice={migrationNotice} />),
);
