// src/hooks/useBridgeStatus.ts
// Circuit breaker + Bridge status hook for degraded/offline detection

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BridgeHealth = "up" | "degraded" | "down" | "timeout" | "unknown";

interface BridgeStatusState {
  health: BridgeHealth;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  consecutiveFailures: number;
  isCircuitOpen: boolean;
}

const CIRCUIT_OPEN_THRESHOLD = 3; // open circuit after 3 consecutive failures
const CIRCUIT_RESET_MS = 60_000; // allow retry after 60s

let globalFailureCount = 0;
let globalCircuitOpenedAt: number | null = null;

export function recordBridgeFailure() {
  globalFailureCount++;
  if (globalFailureCount >= CIRCUIT_OPEN_THRESHOLD) {
    globalCircuitOpenedAt = Date.now();
  }
}

export function recordBridgeSuccess() {
  globalFailureCount = 0;
  globalCircuitOpenedAt = null;
}

export function isBridgeCircuitOpen(): boolean {
  if (globalCircuitOpenedAt === null) return false;
  // Allow retry after CIRCUIT_RESET_MS
  if (Date.now() - globalCircuitOpenedAt > CIRCUIT_RESET_MS) {
    return false; // half-open: allow one attempt
  }
  return true;
}

export function useBridgeStatus() {
  const [state, setState] = useState<BridgeStatusState>({
    health: "unknown",
    lastCheckedAt: null,
    latencyMs: null,
    errorMessage: null,
    consecutiveFailures: globalFailureCount,
    isCircuitOpen: isBridgeCircuitOpen(),
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("bridge_health_logs")
        .select("status, checked_at, latency_ms, error_message")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setState(prev => ({
          ...prev,
          health: "unknown",
          consecutiveFailures: globalFailureCount,
          isCircuitOpen: isBridgeCircuitOpen(),
        }));
        return;
      }

      const health: BridgeHealth =
        data.status === "up" ? "up" :
        data.status === "degraded" ? "degraded" :
        data.status === "timeout" ? "timeout" : "down";

      setState({
        health,
        lastCheckedAt: data.checked_at,
        latencyMs: data.latency_ms,
        errorMessage: data.error_message,
        consecutiveFailures: globalFailureCount,
        isCircuitOpen: isBridgeCircuitOpen(),
      });
    } catch {
      setState(prev => ({
        ...prev,
        health: "unknown",
        consecutiveFailures: globalFailureCount,
        isCircuitOpen: isBridgeCircuitOpen(),
      }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 30_000); // refresh every 30s
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  return {
    ...state,
    refresh: fetchStatus,
  };
}
