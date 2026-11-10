import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from '@/routes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';

function resolveBasename(): string | undefined {
  const env: unknown = Reflect.get(globalThis, 'SFDC_ENV');
  const envBase = env && typeof env === 'object' ? Reflect.get(env, 'basePath') : undefined;
  const baseHref = document.querySelector('base')?.href;
  const raw = typeof envBase === 'string' ? envBase : baseHref ? new URL(baseHref).pathname : '';
  return raw.replace(/\/+$/, '') || undefined;
}

const basename = resolveBasename();
const router = createBrowserRouter(routes, { basename });

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
