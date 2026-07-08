import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRuntimeHealth, RuntimeHealth } from '../../api';
import { computeDynamicWaitSec, getEstimatedWaitSec } from '../../utils/responseTimeEstimate';

const HEALTH_POLL_MS = 10000;
const HEALTH_POLL_HEALTHY_MS = 30000;

export function useBackendHealth() {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
  const [estimatedWaitSec, setEstimatedWaitSec] = useState(() => getEstimatedWaitSec());
  const healthyRef = useRef(false);

  const applyHealth = useCallback((h: RuntimeHealth) => {
    setRuntimeHealth(h);
    const ok = h.status === 'ok';
    setBackendOnline(ok);
    healthyRef.current = ok;
    setEstimatedWaitSec(
      computeDynamicWaitSec({
        fastAnswer: h.fastAnswer,
        llmAvailable: h.llmAvailable,
        llmMode: h.llmMode,
        knowledgeCount: h.knowledge?.knowledgeCount,
        activeAskRequests: h.load?.activeAskRequests,
        maxAskRequests: h.load?.maxAskRequests
      })
    );
    return ok;
  }, []);

  const checkBackendOnline = useCallback(async () => {
    try {
      const h = await fetchRuntimeHealth();
      return applyHealth(h);
    } catch {
      healthyRef.current = false;
      setRuntimeHealth(null);
      setBackendOnline(false);
      return false;
    }
  }, [applyHealth]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled || document.hidden) {
          schedule(HEALTH_POLL_MS);
          return;
        }
        await checkBackendOnline();
        schedule(healthyRef.current ? HEALTH_POLL_HEALTHY_MS : HEALTH_POLL_MS);
      }, delayMs);
    };

    void checkBackendOnline();
    schedule(HEALTH_POLL_MS);

    const onVisibility = () => {
      if (!document.hidden) {
        void checkBackendOnline();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkBackendOnline]);

  return {
    backendOnline,
    runtimeHealth,
    estimatedWaitSec,
    setEstimatedWaitSec,
    checkBackendOnline
  };
}
