import { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InvalidProjectRoute, resolveRequiredProjectId } from './projectRoute';

type ReferenceAssetType = 'video' | 'image' | 'audio';

interface UploadResponse {
  project: { id: string; name: string };
  files: Array<{
    id: string;
    filename?: string;
    source_url?: string;
    ark_file_id?: string;
    purpose: string;
    metadata?: {
      extracted_summary?: string;
      text_extraction_method?: string;
      text_extraction_rejected_reason?: string;
      pdf_page_images?: {
        total_pages?: number;
        rendered_pages?: number;
        image_paths?: string[];
        truncated?: boolean;
      };
    };
  }>;
  references: Array<{ id: string; asset_type: ReferenceAssetType; source_file_id?: string }>;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

export function BriefInputPage() {
  const { projectId } = useParams();
  const apiProjectId = useMemo(() => resolveRequiredProjectId(projectId), [projectId]);
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [briefRemoteSource, setBriefRemoteSource] = useState('');
  const [referenceVideos, setReferenceVideos] = useState<File[]>([]);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceAudio, setReferenceAudio] = useState<File[]>([]);
  const [remoteReferenceSource, setRemoteReferenceSource] = useState('');
  const [remoteReferenceType, setRemoteReferenceType] = useState<ReferenceAssetType>('video');
  const [requirementText, setRequirementText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setResult(null);
    if (!apiProjectId) {
      setErrorMessage('请从具体项目进入 brief 输入。');
      return;
    }

    const validationError = validateInputs({
      briefFile,
      briefRemoteSource,
      referenceVideos,
      referenceImages,
      referenceAudio,
      remoteReferenceSource,
      requirementText,
    });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const formData = new FormData();
    if (requirementText.trim()) {
      formData.append('requirement_text', requirementText.trim());
    }
    if (briefFile) {
      formData.append('brief_file', briefFile);
    }
    if (briefRemoteSource.trim()) {
      formData.append('brief_remote_source', briefRemoteSource.trim());
    }
    referenceVideos.forEach((file) => formData.append('reference_videos', file));
    referenceImages.forEach((file) => formData.append('reference_images', file));
    referenceAudio.forEach((file) => formData.append('reference_audio', file));
    if (remoteReferenceSource.trim()) {
      formData.append(
        'remote_references_json',
        JSON.stringify([{ url: remoteReferenceSource.trim(), asset_type: remoteReferenceType, purpose: '用户提供的远程参考素材' }]),
      );
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${apiProjectId}/brief-input`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? '提交 brief 输入失败');
      }
      setResult(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '提交 brief 输入失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    apiProjectId ? (
    <section className="panel">
      <p className="eyebrow">Step 2</p>
      <h2>输入 brief 与参考素材</h2>
      <p>支持 PDF/PPT brief、参考视频、参考图片、参考音频和自由文本需求，并将输入沉淀为素材库可复用的解析证据。</p>
      <div className="material-context-grid">
        <article className="card material-context-card">
          <span>素材库证据接入</span>
          <h3>Brief、参考素材与需求文本统一入库</h3>
          <p>提交后会保存文件记录、模型文件引用和参考素材关系，后续 brief 解析会优先基于这些素材上下文生成需求理解。</p>
        </article>
        <article className="card material-context-card">
          <span>素材匹配准备</span>
          <h3>视频 / 图片 / 音频分类型承载创意证据</h3>
          <p>参考素材会在确认页映射到具体片段，帮助 Seedance 生成时继承品牌资产、画面风格、声音情绪和镜头节奏。</p>
        </article>
        <article className="card material-context-card">
          <span>缺失素材提示</span>
          <h3>未上传的参考项会转为待补充清单</h3>
          <p>如果 brief 提到但没有提供素材，系统会在解析后标记缺口，避免生成前遗漏关键 Logo、产品图或参考音频。</p>
        </article>
      </div>
      <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label className="full-width">
          Brief 文件
          <input type="file" accept=".pdf,.ppt,.pptx,application/pdf" onChange={(event) => setBriefFile(event.target.files?.[0] ?? null)} />
          <small>仅支持 PDF、PPT、PPTX，本地校验后会提交后端保存并上传 Files API。</small>
        </label>
        <label className="full-width">
          Brief URL / TOS URI
          <input
            placeholder="https://example.com/brief.pdf 或 tos://bucket/path/brief.pdf"
            value={briefRemoteSource}
            onChange={(event) => setBriefRemoteSource(event.target.value)}
          />
        </label>
        <label>
          参考视频
          <input type="file" accept="video/*" multiple onChange={(event) => setReferenceVideos(filesFromInput(event.target.files))} />
        </label>
        <label>
          参考图片
          <input type="file" accept="image/*" multiple onChange={(event) => setReferenceImages(filesFromInput(event.target.files))} />
        </label>
        <label>
          参考音频
          <input type="file" accept="audio/*" multiple onChange={(event) => setReferenceAudio(filesFromInput(event.target.files))} />
        </label>
        <label>
          远程参考素材类型
          <select value={remoteReferenceType} onChange={(event) => setRemoteReferenceType(event.target.value as ReferenceAssetType)}>
            <option value="video">视频</option>
            <option value="image">图片</option>
            <option value="audio">音频</option>
          </select>
        </label>
        <label>
          远程参考素材 URL / TOS URI
          <input
            placeholder="https://example.com/ref.mp4 或 tos://bucket/path/ref.mp4"
            value={remoteReferenceSource}
            onChange={(event) => setRemoteReferenceSource(event.target.value)}
          />
        </label>
        <label className="full-width">
          需求文本
          <textarea
            placeholder="也可以直接输入广告需求文本"
            value={requirementText}
            onChange={(event) => setRequirementText(event.target.value)}
          />
        </label>
        {errorMessage && <p className="error-message full-width">{errorMessage}</p>}
        {result && (
          <div className="success-message full-width">
            <strong>已保存 brief 输入并完成关联</strong>
            <ul>
              <li>项目 ID：{result.project.id}</li>
              <li>文件记录：{result.files.length} 个</li>
              <li>参考素材：{result.references.length} 个</li>
            </ul>
            <div className="extract-summary material-upload-summary">
              <strong>素材匹配上下文已准备</strong>
              <p>
                已将 {result.files.length} 个 brief/文件证据和 {result.references.length} 个参考素材写入项目上下文；下一步解析会输出需求理解、
                素材匹配、缺失素材和生成准备度。
              </p>
            </div>
            {result.files.some((file) => file.metadata?.extracted_summary) && (
              <div className="extract-summary">
                <strong>Brief 文本摘要</strong>
                <ul>
                  {result.files
                    .filter((file) => file.metadata?.extracted_summary)
                    .map((file) => (
                      <li key={file.id}>
                        {file.filename ?? file.source_url ?? 'brief'}：{file.metadata?.extracted_summary}
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {result.files.some((file) => file.metadata?.text_extraction_rejected_reason) && (
              <div className="extract-summary">
                <strong>Brief 文本抽取已跳过</strong>
                <ul>
                  {result.files
                    .filter((file) => file.metadata?.text_extraction_rejected_reason)
                    .map((file) => (
                      <li key={file.id}>
                        {file.filename ?? file.source_url ?? 'brief'}：{file.metadata?.text_extraction_rejected_reason}
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {result.files.some((file) => file.metadata?.pdf_page_images) && (
              <div className="extract-summary">
                <strong>PDF 视觉解析摘要</strong>
                <ul>
                  {result.files
                    .filter((file) => file.metadata?.pdf_page_images)
                    .map((file) => {
                      const pageImages = file.metadata?.pdf_page_images;
                      return (
                        <li key={file.id}>
                          {file.filename ?? file.source_url ?? 'brief'}：共 {pageImages?.total_pages ?? 0} 页，已渲染{' '}
                          {pageImages?.rendered_pages ?? 0} 页{pageImages?.truncated ? '，已按配置截断' : '，未截断'}，页图{' '}
                          {pageImages?.image_paths?.length ?? 0} 张，将随 Seed 2.1 请求用于视觉理解。
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="form-actions full-width">
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '提交中...' : '保存并上传 Files API'}
          </button>
          <Link className="secondary-action" to={`/projects/${apiProjectId}/confirm`}>
            查看解析与方案
          </Link>
        </div>
      </form>
    </section>
    ) : (
      <InvalidProjectRoute />
    )
  );
}

function filesFromInput(fileList: FileList | null): File[] {
  return Array.from(fileList ?? []);
}

function validateInputs(input: {
  briefFile: File | null;
  briefRemoteSource: string;
  referenceVideos: File[];
  referenceImages: File[];
  referenceAudio: File[];
  remoteReferenceSource: string;
  requirementText: string;
}): string {
  if (
    !input.briefFile &&
    !input.briefRemoteSource.trim() &&
    !input.remoteReferenceSource.trim() &&
    !input.requirementText.trim() &&
    input.referenceVideos.length === 0 &&
    input.referenceImages.length === 0 &&
    input.referenceAudio.length === 0
  ) {
    return '请至少上传 brief、输入需求文本或提供参考素材。';
  }

  if (input.briefFile && !isSupportedBrief(input.briefFile)) {
    return 'Brief 文件仅支持 PDF、PPT 或 PPTX。';
  }
  if (input.referenceVideos.some((file) => !file.type.startsWith('video/'))) {
    return '参考视频仅支持 video 类型文件。';
  }
  if (input.referenceImages.some((file) => !file.type.startsWith('image/'))) {
    return '参考图片仅支持 image 类型文件。';
  }
  if (input.referenceAudio.some((file) => !file.type.startsWith('audio/'))) {
    return '参考音频仅支持 audio 类型文件。';
  }
  if ([input.briefRemoteSource, input.remoteReferenceSource].some((source) => source.trim() && !isSupportedRemoteSource(source))) {
    return '远程素材仅支持 HTTP/HTTPS URL 或 TOS URI。';
  }
  return '';
}

function isSupportedBrief(file: File): boolean {
  const filename = file.name.toLowerCase();
  return filename.endsWith('.pdf') || filename.endsWith('.ppt') || filename.endsWith('.pptx') || file.type === 'application/pdf';
}

function isSupportedRemoteSource(source: string): boolean {
  return /^(https?:\/\/|tos:\/\/)/i.test(source.trim());
}
