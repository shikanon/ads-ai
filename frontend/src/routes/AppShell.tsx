import { Link, Outlet } from 'react-router-dom';

const steps = [
  { label: '新建项目', to: '/projects/new' },
  { label: '历史项目', to: '/history' },
  { label: '成品画廊', to: '/gallery' },
];

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>广告 TVC 制作</h1>
        <nav aria-label="主导航">
          {steps.map((step) => (
            <Link key={step.to} to={step.to}>
              {step.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
