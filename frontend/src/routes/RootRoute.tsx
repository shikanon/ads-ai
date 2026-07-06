import { AdminHomePage } from './AdminHomePage';
import { MaterialWorkspacePage } from './MaterialWorkspacePage';
import { isAdminHost } from './deploymentHosts';

export function RootRoute({ hostname }: { hostname?: string }) {
  return isAdminHost(hostname) ? <AdminHomePage /> : <MaterialWorkspacePage />;
}
