import { Link, Outlet } from 'react-router-dom';

const steps = [
  { label: '素材工作台', to: '/' },
  { label: '素材库', to: '/materials' },
  { label: 'Brief 解析', to: '/projects/new' },
  { label: '生成工坊', to: '/gallery' },
  { label: '洞察回流', to: '/materials/insights' },
  { label: '历史记录', to: '/history' },
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
