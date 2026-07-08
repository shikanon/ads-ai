import { NavLink, Outlet } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

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
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-3">
            <Badge className="w-fit" variant="secondary">Asset Intelligence</Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">广告 TVC 制作</h1>
              <p className="mt-2 text-sm leading-6 text-sidebar-foreground/70">
                素材库驱动的广告资产工作台
              </p>
            </div>
          </div>
          <Separator className="bg-sidebar-border" />
        </div>
        <nav className="flex flex-col gap-2 px-4" aria-label="主导航">
          {steps.map((step) => (
            <Button
              asChild
              className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              key={step.to}
              size="lg"
              variant="ghost"
            >
              <NavLink
                className={({ isActive }) => cn(
                  'w-full',
                  isActive && 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border',
                )}
                to={step.to}
              >
                {step.label}
              </NavLink>
            </Button>
          ))}
        </nav>
        <div className="mt-auto p-6">
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4 text-sm leading-6 text-sidebar-foreground/75">
            <strong className="block text-sidebar-foreground">当前工作流</strong>
            入库、解析、生成、回流围绕素材库上下文展开。
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-6 lg:p-10 xl:p-12">
        <Outlet />
      </main>
    </div>
  );
}
