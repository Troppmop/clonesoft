import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import './index.css'
import { ApiError } from './lib/api'
import { captureInstallPrompt } from './lib/install'
import { registerServiceWorker } from './lib/push'
import { keys } from './lib/queries'

// Any 401 means the session expired: clearing the user sends the app back to the login page
function handleError(err: unknown) {
  if (err instanceof ApiError && err.status === 401) queryClient.setQueryData(keys.me, null)
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Client errors (4xx) won't succeed on retry
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})

captureInstallPrompt()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
