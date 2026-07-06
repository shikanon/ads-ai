import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MaterialAsset, MaterialLibraryType } from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

type UploadMode = 'file' | 'tos';

const libraryOptions: Array<{ value: MaterialLibraryType; label: string }> = [
  { value: 'raw', label: '原始素材' },
  { value: 'finished', label: '成品素材' },
  { value: 'knowledge', label: '经验知识' },
];

export function MaterialUploadPage() {
  const [mode, setMode] = useState<UploadMode>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [tosUris, setTosUris] = useState('');
  const [libraryType, setLibraryType] = useState<MaterialLibraryType>('raw');
  const [brandId, setBrandId] = useState('');
  const [actor, setActor] = useState('frontend-user');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [materials, setMaterials] = useState<MaterialAsset[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setMaterials([]);
    const validationError = validateInput(mode, files, tosUris);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = mode === 'file' ? await uploadFiles() : await importTosUris();
      const payload = (await response.json()) as { materials?: MaterialAsset[]; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? '素材入库失败');
      }
      setMaterials(payload.materials ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '素材入库失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  function uploadFiles(): Promise<Response> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('library_type', libraryType);
    formData.append('source_system', 'frontend_upload');
    formData.append('copyright_status', 'cleared');
    formData.append('compliance_status', 'pending');
    formData.append('visibility', 'private');
    if (brandId.trim()) {
      formData.append('brand_id', brandId.trim());
    }
    if (actor.trim()) {
      formData.append('actor', actor.trim());
    }
    return fetch(`${apiBaseUrl}/api/materials/upload`, { method: 'POST', body: formData });
  }

  function importTosUris(): Promise<Response> {
    return fetch(`${apiBaseUrl}/api/materials/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uris: splitUris(tosUris),
        library_type: libraryType,
        source_metadata: { import_channel: 'frontend' },
        copyright_status: 'cleared',
        compliance_status: 'pending',
        visibility: 'private',
        brand_id: brandId.trim() || null,
        actor: actor.trim() || null,
      }),
    });
  }

  return (
    <section className="panel material-panel">
      <p className="eyebrow">Material Ingestion</p>
      <div className="section-header no-margin">
        <div>
          <h2>上传与导入素材</h2>
          <p>支持本地文件入库和 TOS URI 批量导入，入库后进入预处理、打标、索引与检索流程。</p>
        </div>
        <Link className="secondary-action compact-action" to="/materials">返回素材库</Link>
      </div>
      <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          入库方式
          <select value={mode} onChange={(event) => setMode(event.target.value as UploadMode)}>
            <option value="file">本地文件上传</option>
            <option value="tos">TOS URI 批量导入</option>
          </select>
        </label>
        <label>
          库类型
          <select value={libraryType} onChange={(event) => setLibraryType(event.target.value as MaterialLibraryType)}>
            {libraryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          品牌 ID
          <input value={brandId} onChange={(event) => setBrandId(event.target.value)} placeholder="可选，用于品牌分区与权限" />
        </label>
        <label>
          操作人
          <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="用于审计记录" />
        </label>
        {mode === 'file' ? (
          <label className="full-width">
            素材文件
            <input type="file" multiple accept="image/*,video/*,audio/*,.txt,.md,.json,.psd,.ai,.sketch" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            <small>支持图片、视频、音频、文本和工程源文件。后端会校验类型、大小和 MD5 去重。</small>
          </label>
        ) : (
          <label className="full-width">
            TOS URI 列表
            <textarea value={tosUris} onChange={(event) => setTosUris(event.target.value)} placeholder="tos://bucket/path/material-1.mp4&#10;tos://bucket/path/material-2.png" />
            <small>每行一个 TOS URI，适合已有云端素材批量导入。</small>
          </label>
        )}
        {errorMessage && <p className="error-message full-width">{errorMessage}</p>}
        {materials.length > 0 && (
          <div className="success-message full-width">
            <strong>已创建 {materials.length} 个素材记录</strong>
            <ul>
              {materials.map((material) => (
                <li key={material.id}>{material.title || material.filename || material.source_uri || material.id} · {material.status}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="form-actions full-width">
          <button className="primary-action" type="submit" disabled={isSubmitting}>{isSubmitting ? '提交中...' : mode === 'file' ? '上传素材' : '导入 TOS 素材'}</button>
          <Link className="secondary-action" to="/materials/search">上传后去检索</Link>
        </div>
      </form>
    </section>
  );
}

function validateInput(mode: UploadMode, files: File[], tosUris: string): string {
  if (mode === 'file' && files.length === 0) {
    return '请至少选择一个素材文件。';
  }
  if (mode === 'tos' && splitUris(tosUris).length === 0) {
    return '请至少输入一个 TOS URI。';
  }
  if (mode === 'tos' && splitUris(tosUris).some((uri) => !uri.startsWith('tos://'))) {
    return 'TOS 批量导入仅支持 tos:// URI。';
  }
  return '';
}

function splitUris(value: string): string[] {
  return value.split(/\n|,|，/).map((item) => item.trim()).filter(Boolean);
}
