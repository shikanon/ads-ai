import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MaterialInsight } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

export function MaterialInsightsPage() {
  const [insights, setInsights] = useState<MaterialInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadInsights();
  }, []);

  async function loadInsights() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/materials/insights`);
      const payload = (await response.json()) as { insights?: MaterialInsight[]; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '读取素材洞察失败');
      }
      setInsights(payload.insights ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取素材洞察失败');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel material-panel">
      <p className="eyebrow">Creative Insights</p>
      <div className="section-header no-margin">
        <div>
          <h2>经验洞察</h2>
          <p>沉淀高效果成品素材的方法论、脚本模板和可复用 Prompt，让下一轮创意更快起量。</p>
        </div>
        <Link className="secondary-action compact-action" to="/materials/search">用洞察检索素材</Link>
      </div>
      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {isLoading ? <p>正在读取经验洞察...</p> : insights.length === 0 ? (
        <div className="card warning-card material-empty">
          <span>暂无洞察</span>
          <h3>高效果成品回流后会自动生成经验库记录</h3>
          <p>可先对 finished 素材写入曝光、点击、转化等指标。</p>
        </div>
      ) : (
        <div className="insight-grid">
          {insights.map((insight) => (
            <article className="card insight-card" key={insight.id}>
              <span>High Performance Asset</span>
              <h3>{insight.title}</h3>
              <p>{insight.method}</p>
              {Object.keys(insight.metrics_snapshot).length > 0 && <p className="meta-line">指标：{formatMetrics(insight.metrics_snapshot)}</p>}
              {insight.script_template && <div className="insight-block"><strong>脚本模板</strong><p>{insight.script_template}</p></div>}
              {insight.prompt && <div className="insight-block"><strong>Prompt</strong><p>{insight.prompt}</p></div>}
              {insight.material_id && <Link className="secondary-action compact-action" to={`/materials/${insight.material_id}`}>查看来源素材</Link>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatMetrics(metrics: Record<string, number>): string {
  return Object.entries(metrics).map(([key, value]) => `${key}=${value}`).join(' · ');
}
