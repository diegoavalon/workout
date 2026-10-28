import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { registerSW } from "virtual:pwa-register";
import { router } from "./app";
import "./styles/global.css";

const updateSW = registerSW({
  onNeedRefresh() {
    (window as unknown as { __updateSW?: () => void }).__updateSW = () => updateSW(true);
    window.dispatchEvent(new Event("sw-update-ready"));
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
);
