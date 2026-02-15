import { useState, useEffect, useCallback } from 'react';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [supported] = useState(typeof Notification !== 'undefined');

  const requestPermission = useCallback(async () => {
    if (!supported) return 'denied' as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [supported]);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!supported || permission !== 'granted') return;
    try {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      });
    } catch {
      // Service worker fallback for mobile
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options,
        });
      }
    }
  }, [supported, permission]);

  return { supported, permission, requestPermission, sendNotification };
}

/** Check overdue tasks and send notifications */
export function checkOverdueTasks(
  tasks: { id: string; title: string; dueAt: string; completedAt?: string }[],
  sendNotification: (title: string, options?: NotificationOptions) => void,
  lastCheckedRef: React.MutableRefObject<Set<string>>
) {
  const now = new Date();
  const overdue = tasks.filter(t =>
    !t.completedAt &&
    new Date(t.dueAt) < now &&
    !lastCheckedRef.current.has(t.id)
  );

  if (overdue.length > 0) {
    if (overdue.length === 1) {
      sendNotification('Overdue Task', { body: overdue[0].title, tag: `overdue-${overdue[0].id}` });
    } else {
      sendNotification('Overdue Tasks', { body: `${overdue.length} tasks need attention`, tag: 'overdue-batch' });
    }
    overdue.forEach(t => lastCheckedRef.current.add(t.id));
  }
}
