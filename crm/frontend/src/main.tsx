import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import { App } from "./App";
import { LiquidFilters } from "./components/glass/LiquidFilters";
import { ConfirmProvider, TooltipProvider } from "./components/ui/overlay";
import { ApiError } from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <ConfirmProvider>
            <LiquidFilters />
            <App />
            <Toaster
              position="bottom-right"
              offset={20}
              toastOptions={{
                unstyled: true,
                classNames: {
                  toast: "glass glass-strong flex w-[360px] max-w-[calc(100vw-24px)] items-start gap-3 rounded-[18px] p-4 text-fg shadow-[var(--glass-shadow-lg)]",
                  title: "text-[14px] font-semibold leading-snug",
                  description: "mt-0.5 text-[12.5px] text-fg-2 whitespace-pre-line",
                  actionButton: "btn-primary ml-auto h-8 shrink-0 rounded-[10px] px-3 text-[12.5px] font-medium",
                  cancelButton: "ml-auto h-8 shrink-0 rounded-[10px] px-3 text-[12.5px] text-fg-2",
                  success: "[&_[data-icon]]:text-emerald-500",
                  error: "[&_[data-icon]]:text-red-500",
                  icon: "mt-0.5",
                },
              }}
            />
          </ConfirmProvider>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
