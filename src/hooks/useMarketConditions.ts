import { useState, useCallback } from 'react';
import type { MarketConditions } from '@/lib/marketConditions';
import { DEFAULT_MARKET_CONDITIONS } from '@/lib/marketConditions';

const STORAGE_KEY = 'dp-market-conditions';

function loadConditions(): MarketConditions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_MARKET_CONDITIONS;
}

export function useMarketConditions() {
  const [conditions, setConditionsState] = useState<MarketConditions>(loadConditions);

  const updateConditions = useCallback((partial: Partial<MarketConditions>) => {
    setConditionsState(prev => {
      const next = { ...prev, ...partial, updatedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetConditions = useCallback(() => {
    const fresh = { ...DEFAULT_MARKET_CONDITIONS, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    setConditionsState(fresh);
  }, []);

  return { conditions, updateConditions, resetConditions };
}
