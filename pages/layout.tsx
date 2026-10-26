import type { ReactNode } from "react";
import { ToastProvider } from "../src/components/ui/toast";
import "../src/styles/global.css";

export default function Layout({ children }: { children: ReactNode }) {
  return <ToastProvider position="bottom-center">{children}</ToastProvider>;
}
