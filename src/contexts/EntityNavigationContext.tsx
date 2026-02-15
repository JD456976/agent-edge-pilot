import React, { createContext, useContext, useState, useCallback } from 'react';

export interface EntityNavigationRequest {
  entityId: string;
  entityType: 'deal' | 'lead';
  timestamp: number;
}

interface EntityNavigationState {
  pendingNavigation: EntityNavigationRequest | null;
  requestOpenEntity: (entityId: string, entityType: 'deal' | 'lead') => void;
  clearNavigation: () => void;
}

const EntityNavigationContext = createContext<EntityNavigationState>({
  pendingNavigation: null,
  requestOpenEntity: () => {},
  clearNavigation: () => {},
});

export function EntityNavigationProvider({ children }: { children: React.ReactNode }) {
  const [pendingNavigation, setPendingNavigation] = useState<EntityNavigationRequest | null>(null);

  const requestOpenEntity = useCallback((entityId: string, entityType: 'deal' | 'lead') => {
    setPendingNavigation({ entityId, entityType, timestamp: Date.now() });
  }, []);

  const clearNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  return (
    <EntityNavigationContext.Provider value={{ pendingNavigation, requestOpenEntity, clearNavigation }}>
      {children}
    </EntityNavigationContext.Provider>
  );
}

export function useEntityNavigation() {
  return useContext(EntityNavigationContext);
}
