import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

interface SupabaseClientState {
  client: SupabaseClient | null;
  error: string | null;
}

let cachedState: SupabaseClientState | null = null;

export function getSupabaseClientState(): SupabaseClientState {
  if (cachedState) {
    return cachedState;
  }

  const supabaseUrl = environment.supabaseUrl.trim();
  const supabaseKey = environment.supabaseKey.trim();

  if (!supabaseUrl || !supabaseKey) {
    cachedState = {
      client: null,
      error:
        'Supabase is not configured. Set supabaseUrl and supabaseKey in src/environments/environment.ts.',
    };

    return cachedState;
  }

  cachedState = {
    client: createClient(supabaseUrl, supabaseKey),
    error: null,
  };

  return cachedState;
}
