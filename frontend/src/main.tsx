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
import { MaterialDetailPage } from './routes/MaterialDetailPage';
import { MaterialInsightsPage } from './routes/MaterialInsightsPage';
import { MaterialLibraryPage } from './routes/MaterialLibraryPage';
import { MaterialSearchPage } from './routes/MaterialSearchPage';
import { MaterialUploadPage } from './routes/MaterialUploadPage';
import { MaterialWorkspacePage } from './routes/MaterialWorkspacePage';
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
      { path: 'workspace', element: <MaterialWorkspacePage /> },
      { path: 'materials', element: <MaterialLibraryPage /> },
      { path: 'materials/upload', element: <MaterialUploadPage /> },
      { path: 'materials/search', element: <MaterialSearchPage /> },
      { path: 'materials/insights', element: <MaterialInsightsPage /> },
      { path: 'materials/:materialId', element: <MaterialDetailPage /> },
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
