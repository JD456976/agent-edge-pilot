import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitConfig {
  functionName: string;
  dailyLimit: number;
}

/**
 * Checks if the user is within their daily limit for this function.
 * Logs the usage if allowed.
 * Returns { allowed: boolean, used: number, limit: number }
 */
export async function checkAndLogUsage(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await serviceClient
    .from('ai_usage_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('function_name', config.functionName)
    .gte('created_at', todayStart.toISOString());

  const used = count ?? 0;

  if (used >= config.dailyLimit) {
    return { allowed: false, used, limit: config.dailyLimit };
  }

  // Log this usage — fail open if insert fails
  try {
    await serviceClient.from('ai_usage_log').insert({
      user_id: userId,
      function_name: config.functionName,
    });
  } catch {
    // Non-critical — never block user due to logging error
  }

  return { allowed: true, used: used + 1, limit: config.dailyLimit };
}
