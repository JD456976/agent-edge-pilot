import { useState, useCallback } from 'react';
import { callEdgeFunction } from '@/lib/edgeClient';
import { toast } from '@/hooks/use-toast';

interface SendOptions {
  fubPersonId: number;
  entityId: string;
  entityType: 'deal' | 'lead';
}

export function useFubSend(options: SendOptions | null) {
  const [sending, setSending] = useState(false);

  const sendText = useCallback(async (message: string) => {
    if (!options) return false;
    setSending(true);
    try {
      const result = await callEdgeFunction('fub-send-message', {
        channel: 'text',
        fub_person_id: options.fubPersonId,
        message,
        entity_id: options.entityId,
        entity_type: options.entityType,
      });
      if (result?.error) throw new Error(result.error);
      toast({ description: 'Text sent via FUB' });
      return true;
    } catch (err: any) {
      toast({ description: err?.message || 'Failed to send text', variant: 'destructive' });
      return false;
    } finally {
      setSending(false);
    }
  }, [options]);

  const sendEmail = useCallback(async (subject: string, body: string) => {
    if (!options) return false;
    setSending(true);
    try {
      const result = await callEdgeFunction('fub-send-message', {
        channel: 'email',
        fub_person_id: options.fubPersonId,
        subject,
        body,
        entity_id: options.entityId,
        entity_type: options.entityType,
      });
      if (result?.error) throw new Error(result.error);
      toast({ description: 'Email sent via FUB' });
      return true;
    } catch (err: any) {
      toast({ description: err?.message || 'Failed to send email', variant: 'destructive' });
      return false;
    } finally {
      setSending(false);
    }
  }, [options]);

  return { sendText, sendEmail, sending };
}
