/**
 * Shared helper for calling the /api/claude proxy.
 * Handles HTTP errors AND Anthropic body-level errors (200 with error type).
 */
export async function callClaude(body: object): Promise<any> {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const msg: string = data?.error?.message || '';
    if (msg.toLowerCase().includes('credit balance') || msg.toLowerCase().includes('too low')) {
      throw new Error('AI features temporarily unavailable — credits needed.');
    }
    throw new Error(`API error ${response.status}: ${msg || 'Unknown error'}`);
  }

  // Anthropic can return 200 with a body-level error
  if (data?.type === 'error') {
    const msg: string = data?.error?.message || '';
    const errType: string = data?.error?.type || '';
    if (errType === 'not_found_error') {
      throw new Error('AI model configuration error. Contact support.');
    }
    if (errType === 'overloaded_error') {
      throw new Error('AI is temporarily overloaded. Try again in a moment.');
    }
    if (msg.toLowerCase().includes('credit balance') || msg.toLowerCase().includes('too low')) {
      throw new Error('AI features temporarily unavailable — credits needed.');
    }
    throw new Error(msg || 'Could not generate response. Please try again.');
  }

  return data;
}

/** Extract text from an Anthropic response */
export function getResponseText(data: any): string {
  return data?.content?.[0]?.text || '';
}
