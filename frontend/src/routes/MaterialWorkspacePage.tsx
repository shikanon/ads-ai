import { Link } from 'react-router-dom';

const workflowSteps = [
  {
    title: '1. 素材入库',
    description: '上传原始素材、导入 TOS URI 或接收外部 API 素材，让资产先进入可追踪状态。',
    action: '上传素材',
    to: '/materials/upload',
  },
  {
    title: '2. Brief 解析',
    description: '从品牌、产品、受众和禁用项中抽取需求，并匹配可复用素材与缺失素材。',
    action: '进入 Brief 解析',
    to: '/projects/new',
  },
  {
    title: '3. 生成工坊',
    description: '基于素材标签、检索证据和参考资产组织生成上下文，产出新的广告片段。',
    action: '创建生成任务',
    to: '/projects/new',
  },
  {
    title: '4. 回流复用',
    description: '将成片和效果数据沉淀为 finished 素材与经验洞察，持续提升下一轮检索质量。',
    action: '查看洞察回流',
    to: '/materials/insights',
  },
];

const healthMetrics = [
  { label: '入库通道', value: '3 类', hint: '上传 / TOS / 外部 API' },
  { label: '素材状态', value: '7 个', hint: '接收、打标、索引、可检索等' },
  { label: '资产分层', value: '3 层', hint: '原始素材、成品素材、经验知识' },
];

const queueItems = [
  { label: '待补充标签', value: '低置信度标签需人工校准' },
  { label: '待索引素材', value: '完成打标后进入向量化与混合检索' },
  { label: '待回流成片', value: '成品素材写入效果指标后生成经验洞察' },
];

const nextActions = [
  { label: '检索夏日饮料开场 hook', to: '/materials/search' },
  { label: '导入一批 TOS 素材', to: '/materials/upload' },
  { label: '从素材库开始新 Brief', to: '/projects/new' },
  { label: '查看历史生成记录', to: '/history' },
];

export function MaterialWorkspacePage() {
  return (
    <section className="panel material-panel workspace-panel">
      <div className="workspace-hero">
        <p className="eyebrow">Material Workspace</p>
        <h2>素材工作台</h2>
        <p>
          从素材库开始完成入库、Brief 解析、素材生成、检索问答和成片回流。这里是素材驱动广告生产的默认入口。
        </p>
        <div className="form-actions">
          <Link className="primary-action" to="/materials/upload">
            入库素材
          </Link>
          <Link className="secondary-action" to="/materials/search">
            RAG 检索问答
          </Link>
        </div>
      </div>

      <div className="workspace-metrics" aria-label="资产健康概览">
        {healthMetrics.map((metric) => (
          <article className="card metric-card workspace-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.hint}</p>
          </article>
        ))}
      </div>

      <div className="workspace-layout">
        <section className="card workspace-section">
          <div className="section-header no-margin">
            <div>
              <span>Material-driven flow</span>
              <h3>素材驱动流程</h3>
            </div>
          </div>
          <div className="workspace-flow">
            {workflowSteps.map((step) => (
              <article className="workspace-step" key={step.title}>
                <h4>{step.title}</h4>
                <p>{step.description}</p>
                <Link className="secondary-action compact-action" to={step.to}>
                  {step.action}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <aside className="workspace-side">
          <section className="card workspace-section">
            <span>Processing Queue</span>
            <h3>处理队列</h3>
            <ul className="workspace-queue">
              {queueItems.map((item) => (
                <li key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card workspace-section">
            <span>Next Actions</span>
            <h3>下一步动作</h3>
            <div className="workspace-actions">
              {nextActions.map((action) => (
                <Link className="secondary-action compact-action" key={action.label} to={action.to}>
                  {action.label}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
