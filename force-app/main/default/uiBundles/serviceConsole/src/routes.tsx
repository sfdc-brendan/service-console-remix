import type { RouteObject } from 'react-router';
import AppLayout from '@/appLayout';
import Home from './pages/Home';
import SearchPage from './pages/SearchPage';
import CaseRecord from './pages/CaseRecord';
import VoiceRecord from './pages/VoiceRecord';
import MessagingRecord from './pages/MessagingRecord';
import ContactRecord from './pages/ContactRecord';
import AccountRecord from './pages/AccountRecord';
import Supervisor from './pages/Supervisor';
import NotFound from './pages/NotFound';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Home />,
        handle: { showInNavigation: true, label: 'Home' },
      },
      {
        path: 'supervisor',
        element: <Supervisor />,
        handle: { showInNavigation: true, label: 'Command Center' },
      },
      {
        path: 'search',
        element: <SearchPage />,
        handle: { showInNavigation: true, label: 'Search' },
      },
      {
        path: 'case/:recordId',
        element: <CaseRecord />,
      },
      {
        path: 'voice/:recordId',
        element: <VoiceRecord />,
      },
      {
        path: 'messaging/:recordId',
        element: <MessagingRecord />,
      },
      {
        path: 'contact/:recordId',
        element: <ContactRecord />,
      },
      {
        path: 'account/:recordId',
        element: <AccountRecord />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
];
