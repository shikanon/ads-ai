import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { InvalidProjectRoute, resolveRequiredProjectId } from './projectRoute';

type ReferenceAssetType = 'video' | 'image' | 'audio';

interface NavigateState {
  createdDraft?: boolean;
  projectName?: string;
}

interface RemoteReference {
  id: string;
  url: string;
  assetType: ReferenceAssetType;
  purpose?: string;
}

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
  const location = useLocation();
  const navigate = useNavigate();
  const apiProjectId = useMemo(() => resolveRequiredProjectId(projectId), [projectId]);
  const navState = (location.state as NavigateState | null) ?? null;
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [briefRemoteSource, setBriefRemoteSource] = useState('');
  const [referenceVideos, setReferenceVideos] = useState<File[]>([]);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceAudio, setReferenceAudio] = useState<File[]>([]);
  const [remoteReferences, setRemoteReferences] = useState<RemoteReference[]>([]);
  const [pendingUrl, setPendingUrl] = useState('');
  const [pendingType, setPendingType] = useState<ReferenceAssetType>('video');
  const [pendingPurpose, setPendingPurpose] = useState('');
  const [requirementText, setRequirementText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigatingToConfirm, setIsNavigatingToConfirm] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);

  useEffect(() => {
    if (navState?.createdDraft) {
      const name = navState.projectName ? `「${navState.projectName}」` : '草稿项目';
      setWelcomeMessage(`${name}已创建。请至少提供一种 brief 输入：上传 PDF/PPT 文件、填写远程 brief 地址、输入需求文本，或提供参考素材。`);
    } else if (navState?.projectName) {
      setWelcomeMessage(`项目「${navState.projectName}」已创建，可继续补充 brief 和参考素材。`);
    }
  }, [navState?.createdDraft, navState?.projectName]);

  function addRemoteReference() {
    const url = pendingUrl.trim();
    if (!url) return;
    if (!isSupportedRemoteSource(url)) {
      setErrorMessage('远程素材仅支持 HTTP/HTTPS URL 或 TOS URI。');
      return;
    }
    const exists = remoteReferences.some((r) => r.url === url);
    if (exists) {
      setErrorMessage('该远程素材地址已添加，请勿重复添加。');
      return;
    }
    setErrorMessage('');
    setRemoteReferences((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        assetType: pendingType,
        purpose: pendingPurpose.trim() || undefined,
      },
    ]);
    setPendingUrl('');
    setPendingPurpose('');
  }

  function removeRemoteReference(id: string) {
    setRemoteReferences((prev) => prev.filter((r) => r.id !== id));
  }

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
      remoteReferences,
      pendingUrl,
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
    if (remoteReferences.length > 0) {
      formData.append(
        'remote_references_json',
        JSON.stringify(
          remoteReferences.map((r) => ({
            url: r.url,
            asset_type: r.assetType,
            purpose: r.purpose ?? '用户提供的远程参考素材',
          })),
        ),
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

  function handleGoToConfirm() {
    if (!apiProjectId || !result) return;
    setIsNavigatingToConfirm(true);
    navigate(`/projects/${apiProjectId}/confirm`, {
      state: { fromBriefSubmit: true, projectName: result.project.name },
    });
  }

  const canProceedToConfirm = result && !isSubmitting;

  return (
    apiProjectId ? (
    <section className="panel">
      <p className="eyebrow">Step 2</p>
      <h2>输入 brief 与参考素材</h2>
      <p>支持 PDF/PPT brief、参考视频、参考图片、参考音频和自由文本需求。</p>
      {welcomeMessage && (
        <div className="welcome-banner">
          <strong>项目已创建</strong>
          <p>{welcomeMessage}</p>
        </div>
      )}
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
        <div className="full-width remote-ref-section">
          <label className="section-label">远程参考素材（可批量添加）</label>
          {remoteReferences.length > 0 && (
            <ul className="remote-ref-list">
              {remoteReferences.map((ref) => (
                <li key={ref.id}>
                  <span className={`ref-type-badge ref-type-${ref.assetType}`}>{refTypeLabel(ref.assetType)}</span>
                  <span className="ref-url">{ref.url}</span>
                  {ref.purpose && <span className="ref-purpose">{ref.purpose}</span>}
                  <button type="button" className="text-btn danger" onClick={() => removeRemoteReference(ref.id)}>移除</button>
                </li>
              ))}
            </ul>
          )}
          <div className="remote-ref-input-row">
            <select value={pendingType} onChange={(event) => setPendingType(event.target.value as ReferenceAssetType)}>
              <option value="video">视频</option>
              <option value="image">图片</option>
              <option value="audio">音频</option>
            </select>
            <input
              placeholder="https://example.com/ref.mp4 或 tos://bucket/path/ref.mp4"
              value={pendingUrl}
              onChange={(event) => setPendingUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addRemoteReference();
                }
              }}
            />
            <input
              placeholder="用途说明（可选）"
              value={pendingPurpose}
              onChange={(event) => setPendingPurpose(event.target.value)}
            />
            <button type="button" className="secondary-action small" onClick={addRemoteReference}>添加</button>
          </div>
          <small>支持 HTTP/HTTPS URL 或 TOS URI，可添加多个远程参考素材。按 Enter 快速添加。</small>
        </div>
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
            <div className="next-step-hint">
              <p>Brief 已保存。下一步：系统将解析 Brief 内容并生成广告方案，您可以在确认页审核后再启动生成。</p>
            </div>
          </div>
        )}
        <div className="form-actions full-width">
          {canProceedToConfirm ? (
            <>
              <button className="primary-action" type="button" onClick={handleGoToConfirm} disabled={isNavigatingToConfirm}>
                {isNavigatingToConfirm ? '跳转中...' : '开始解析并生成方案 →'}
              </button>
              <button type="button" className="secondary-action" onClick={() => { setResult(null); }}>
                继续补充素材
              </button>
            </>
          ) : (
            <>
              <button className="primary-action" type="submit" disabled={isSubmitting}>
                {isSubmitting ? '提交中...' : '保存并上传 Files API'}
              </button>
              <Link className="secondary-action" to={`/projects/${apiProjectId}/confirm`}>
                跳过并直接查看方案
              </Link>
            </>
          )}
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

function refTypeLabel(t: ReferenceAssetType): string {
  if (t === 'video') return '视频';
  if (t === 'image') return '图片';
  return '音频';
}

function validateInputs(input: {
  briefFile: File | null;
  briefRemoteSource: string;
  referenceVideos: File[];
  referenceImages: File[];
  referenceAudio: File[];
  remoteReferences: RemoteReference[];
  pendingUrl: string;
  requirementText: string;
}): string {
  const hasPendingRemote = input.pendingUrl.trim().length > 0;
  if (hasPendingRemote) {
    return '请先点击「添加」将未添加的远程素材加入列表，或清空输入框后再提交。';
  }
  if (
    !input.briefFile &&
    !input.briefRemoteSource.trim() &&
    input.remoteReferences.length === 0 &&
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
  if (input.briefRemoteSource.trim() && !isSupportedRemoteSource(input.briefRemoteSource)) {
    return 'Brief 远程地址仅支持 HTTP/HTTPS URL 或 TOS URI。';
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
