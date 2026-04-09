import { StrictMode, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import {
  ApiKeyDialog,
  getStoredApiKey,
  setStoredApiKey,
} from "./components/ui/api-key-dialog";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Don't retry auth errors
        if ((error as any)?.status === 401) return false;
        return failureCount < 1;
      },
    },
  },
});

function Root() {
  const [showKeyDialog, setShowKeyDialog] = useState(false);

  // Global error handler: show API key dialog on 401
  const onQueryError = useCallback((error: unknown) => {
    if ((error as any)?.status === 401 && !getStoredApiKey()) {
      setShowKeyDialog(true);
    }
  }, []);

  // Set the global error handler
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      meta: { onError: onQueryError },
    },
  });

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
      <ApiKeyDialog
        open={showKeyDialog}
        onSave={(key) => {
          setStoredApiKey(key);
          setShowKeyDialog(false);
          queryClient.invalidateQueries();
        }}
        onClose={() => setShowKeyDialog(false)}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
