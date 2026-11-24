import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary
    fullScreen
    title="SchemaForge encountered an unexpected error"
    description="An unexpected runtime error occurred. You can retry rendering or reload the application."
  >
    <App />
  </ErrorBoundary>
);
