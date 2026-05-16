// Lovable auth integration — replaced with no-op stub after Supabase migration.
// Authentication is handled directly via supabase.auth in AuthContext.tsx.
export const lovable = {
  auth: {
    signInWithOAuth: async () => {
      throw new Error('OAuth via Lovable is not supported. Use magic link auth.');
    },
  },
};
