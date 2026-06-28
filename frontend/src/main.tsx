import React from 'react';
import ReactDOM from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AdminHomePage } from './routes/AdminHomePage';
import { AppShell } from './routes/AppShell';
import { BriefInputPage } from './routes/BriefInputPage';
import { ConfirmPlanPage } from './routes/ConfirmPlanPage';
import { GalleryPage } from './routes/GalleryPage';
import { GenerationProgressPage } from './routes/GenerationProgressPage';
import { HistoryPage } from './routes/HistoryPage';
import { ProjectCreatePage } from './routes/ProjectCreatePage';
import { ResultPreviewPage } from './routes/ResultPreviewPage';
import { RootRoute } from './routes/RootRoute';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <RootRoute /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'admin', element: <AdminHomePage /> },
      { path: 'projects/new', element: <ProjectCreatePage /> },
      { path: 'projects/:projectId/brief', element: <BriefInputPage /> },
      { path: 'projects/:projectId/confirm', element: <ConfirmPlanPage /> },
      { path: 'projects/:projectId/progress', element: <GenerationProgressPage /> },
      { path: 'projects/:projectId/preview', element: <ResultPreviewPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
