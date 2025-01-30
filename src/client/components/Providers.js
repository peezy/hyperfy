import { createConfig, http, injected, WagmiProvider } from 'wagmi'
import { base } from 'wagmi/chains'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const queryClient = new QueryClient()

export const Providers = ({ children }) => (
  <WagmiProvider
    config={createConfig({
      chains: [base],
      transports: {
        [base.id]: http(),
      },
      connectors: [injected()],
      multiInjectedProviderDiscovery: false,
    })}
  >
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  </WagmiProvider>
)
