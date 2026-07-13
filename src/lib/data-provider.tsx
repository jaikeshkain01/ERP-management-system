"use client";

/**
 * Client data provider — the frontend's single source of truth. It loads
 * /api/bootstrap once (auto-logging-in via /api/auth/dev-login if there's no
 * session), binds the shared selector factory (@/lib/catalog) to the result,
 * and exposes everything through `useData()`.
 */
import * as React from "react";
import { createSelectors, type DataSet, type Selectors } from "@/lib/catalog";

const EMPTY: DataSet = { components: [], brands: [], suppliers: [], pcbs: [], products: [] };

export interface Me {
  user: { id: string; name: string; email: string };
  company: { id: string; code: string; name: string };
  permissions: string[];
}

type DataContextValue = Selectors & {
  loading: boolean;
  error: string | null;
  me: Me | null;
  /** True if the caller's role holds `resource.action` (always true in mock mode). */
  can: (permission: string) => boolean;
  reload: () => void;
};

const DataContext = React.createContext<DataContextValue | null>(null);

async function dataOrThrow(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || res.statusText || "Request failed");
  return body.data;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<DataSet>(EMPTY);
  const [me, setMe] = React.useState<Me | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let meRes = await fetch("/api/me", { cache: "no-store" });
      if (meRes.status === 401) {
        await fetch("/api/auth/dev-login", { method: "POST" });
        meRes = await fetch("/api/me", { cache: "no-store" });
      }
      setMe(await dataOrThrow(meRes));
      setData(await dataOrThrow(await fetch("/api/bootstrap", { cache: "no-store" })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const selectors = React.useMemo(() => createSelectors(data), [data]);
  const permissionSet = React.useMemo(() => new Set(me?.permissions ?? []), [me]);

  const value: DataContextValue = {
    ...selectors,
    loading,
    error,
    me,
    can: (permission: string) => permissionSet.size === 0 || permissionSet.has(permission),
    reload: load,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** Access the loaded dataset + selectors. Must be used inside <DataProvider>. */
export function useData(): DataContextValue {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error("useData() must be used within <DataProvider>");
  return ctx;
}

/**
 * Gate content on the initial data load: shows a loading/error screen until the
 * bootstrap is ready, then renders children. Wrap page content (main), NOT the
 * chrome — so the top bar (which also uses the data, e.g. universal search)
 * stays visible while data loads.
 */
export function DataGate({ children }: { children: React.ReactNode }) {
  const { loading, error, reload } = useData();
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} onRetry={reload} />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-sm font-medium text-muted-foreground">
      <span className="animate-pulse">Loading data…</span>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-semibold text-destructive">Failed to load data</p>
      <p className="max-w-md text-xs text-muted-foreground">{error}</p>
      <button
        onClick={onRetry}
        className="rounded-lg border border-border bg-card px-4 py-1.5 text-xs font-semibold hover:bg-muted/50"
      >
        Retry
      </button>
    </div>
  );
}
