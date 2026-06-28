import { Link } from 'react-router-dom';

export function resolveRequiredProjectId(routeProjectId: string | undefined): string | null {
  return routeProjectId && isUuid(routeProjectId) ? routeProjectId : null;
}

export function InvalidProjectRoute() {
  return (
    <section className="panel">
      <p className="eyebrow">Project Required</p>
      <h2>请从具体项目进入</h2>
      <p>项目详情页需要有效的项目 ID。请从历史项目、成品画廊或新建项目流程继续。</p>
      <div className="form-actions">
        <Link className="primary-action" to="/projects/new">
          新建项目
        </Link>
        <Link className="secondary-action" to="/history">
          查看历史项目
        </Link>
        <Link className="secondary-action" to="/gallery">
          查看成品画廊
        </Link>
      </div>
    </section>
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
