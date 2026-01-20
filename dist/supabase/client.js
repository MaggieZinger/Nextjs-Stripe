// src/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
var createClient = () => createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
export {
  createClient
};
//# sourceMappingURL=client.js.map