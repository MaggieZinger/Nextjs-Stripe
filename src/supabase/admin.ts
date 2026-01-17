import { createClient } from '@supabase/supabase-js'
import { env } from '../env/server'

export const createAdminClient = () => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations.')
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}
