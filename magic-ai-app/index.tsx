
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { AppProvider } from './store';
import './index.css';

/**
 * Dev-only environment validation (helps catch missing Vercel/Vite env vars early)
 */
if (import.meta.env.DEV) {
  const missing: string[] = [];
  if (!import.meta.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');

  if (missing.length) {
    console.warn('⚠️ Missing required environment variables:', missing.join(', '));
  } else {
    console.log('✅ Env check passed: Supabase variables found');
  }
}


console.log("🪄 Magic AI Wizard: Igniting the Spark...");

const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ToastProvider>
            <AppProvider>
              <App />
            </AppProvider>
          </ToastProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
    console.log("✨ Magic AI Wizard: Mounted successfully.");
  } catch (error) {
    console.error("🔥 Magic AI Wizard: Failed to mount app:", error);
  }
} else {
  console.error("🚫 Magic AI Wizard: Root element '#root' was not found in the DOM.");
}

// NOTE: Service workers can make blank-screen issues "stick" by caching a broken build.
// Keep this OFF until your production deployment is stable.
// If you re-enable it later, use import.meta.env.PROD (Vite) rather than process.env.
//
// if ('serviceWorker' in navigator && import.meta.env.PROD) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js')
//       .then(() => console.log('ServiceWorker registration successful'))
//       .catch(err => console.log('ServiceWorker registration failed: ', err));
//   });
// }
