import { Link } from 'react-router-dom';
import { getAdminAppHost, getMainAppHost } from './deploymentHosts';

export function AdminHomePage() {
  return (
    <section className="panel admin-panel">
      <p className="eyebrow">Admin Console</p>
      <h2>广告 TVC 管理后台</h2>
      <p>
        当前入口由 <strong>{getAdminAppHost()}</strong> 提供，用于部署后的运营巡检、项目管理和成片复核。
      </p>
      <div className="admin-grid" aria-label="管理后台入口">
        <article className="card">
          <span>Project Ops</span>
          <h3>历史项目管理</h3>
          <p>查看已创建项目、检查状态并进入具体项目继续处理。</p>
          <Link className="secondary-action compact-action" to="/history">
            查看历史项目
          </Link>
        </article>
        <article className="card">
          <span>Gallery Review</span>
          <h3>成品画廊复核</h3>
          <p>集中查看已有成片，确认预览、下载和项目详情入口。</p>
          <Link className="secondary-action compact-action" to="/gallery">
            查看成品画廊
          </Link>
        </article>
        <article className="card">
          <span>Main App</span>
          <h3>主程序入口</h3>
          <p>主域名 {getMainAppHost()} 默认进入新建项目流程。</p>
          <Link className="primary-action compact-action" to="/projects/new">
            新建项目
          </Link>
        </article>
      </div>
    </section>
  );
}
