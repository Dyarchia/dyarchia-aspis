import { applyTheme } from "@dyarchia/aspis";
import { Theme } from "@dyarchia/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { readHint } from "./hints.ts";
import { openLinksOutside } from "./links.ts";
import "./styles.css";

applyTheme(Theme.catch("io").parse(readHint("theme")));
openLinksOutside();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
