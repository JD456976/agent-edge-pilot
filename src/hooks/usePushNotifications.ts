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

/** Check overdue tasks and send a single batched notification */
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
    // Always batch into a single digest notification
    const topItems = overdue.slice(0, 3).map(t => t.title);
    const body = overdue.length <= 3
      ? topItems.join('\n')
      : `${topItems.join('\n')}\n+${overdue.length - 3} more`;
    sendNotification(
      `${overdue.length} Overdue Task${overdue.length > 1 ? 's' : ''}`,
      { body, tag: 'overdue-digest' }
    );
    overdue.forEach(t => lastCheckedRef.current.add(t.id));
  }
}
