import { AdminHomePage } from './AdminHomePage';
import { ProjectCreatePage } from './ProjectCreatePage';
import { isAdminHost } from './deploymentHosts';

export function RootRoute({ hostname }: { hostname?: string }) {
  return isAdminHost(hostname) ? <AdminHomePage /> : <ProjectCreatePage />;
}
