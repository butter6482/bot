"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./client";
import type { AccountRecord } from "./selection";

export interface AccountsPayload {
  importId: string | null;
  importedAt: string | null;
  accounts: AccountRecord[];
  stats: {
    followers: number;
    following: number;
    mutual: number;
    notFollowingBack: number;
    followersNotFollowedBack: number;
  };
}

export function useAccounts() {
  const [data, setData] = useState<AccountsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api<AccountsPayload>("/api/accounts"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { data, error, loading: !data && !error, reload };
}
