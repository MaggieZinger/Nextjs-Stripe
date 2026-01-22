import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'billing/server': 'src/billing/server.ts',
    'billing/client': 'src/billing/client.tsx',
    'webhook/index': 'src/webhook/index.ts',
    'env/server': 'src/env/server.ts',
    'env/client': 'src/env/client.ts',
    'stripe/server': 'src/stripe/server.ts',
    'stripe/client': 'src/stripe/client.ts',
    'supabase/server': 'src/supabase/server.ts',
    'supabase/client': 'src/supabase/client.ts',
    'supabase/admin': 'src/supabase/admin.ts',
    'ui/button': 'src/ui/button.tsx',
    'ui/badge': 'src/ui/badge.tsx',
    'ui/card': 'src/ui/card.tsx',
    'ui/cn': 'src/ui/cn.ts'
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['next', 'react', 'react-dom', 'server-only']
})
