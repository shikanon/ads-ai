export type WorkflowStep = 'brief' | 'confirm' | 'progress' | 'preview';

export interface ProjectDraft {
  id: string;
  name: string;
  status: 'draft' | 'parsing' | 'plan_ready' | 'confirmed' | 'generating' | 'compositing' | 'completed' | 'failed';
  created_at?: string;
  updated_at?: string;
  requirementText?: string;
  targetDurationSeconds?: number;
}

export interface ProjectHistorySummary {
  id: string;
  name: string;
  status: ProjectDraft['status'];
  created_at: string;
  updated_at: string;
  target_duration_seconds?: number;
  segment_count: number;
  final_result_status: FinalResult['status'];
  summary: string;
}

export interface GalleryItem extends ProjectHistorySummary {
  final_result: FinalResult;
  preview_url?: string;
  download_url?: string;
  duration_seconds?: number;
}

export interface RequirementItem {
  id: string;
  category: 'brand' | 'product' | 'audience' | 'selling_point' | 'style' | 'constraint' | 'delivery' | 'other';
  title: string;
  content: string;
  required: boolean;
}

export interface ReferenceAsset {
  id: string;
  asset_type: 'video' | 'image' | 'audio';
  purpose: string;
  source_file_id?: string;
  usage_notes?: string;
  is_missing: boolean;
}

export interface ParsedBriefPayload {
  project: ProjectDraft | null;
  requirements: RequirementItem[];
  references: ReferenceAsset[];
  segment_plans: SegmentPlan[];
  generation_plan?: GenerationPlanSnapshot;
  generation_tasks?: GenerationProgress[];
  final_result?: FinalResult | null;
  parse_result?: {
    summary: string;
    requirement_ids: string[];
    reference_ids: string[];
  };
}

export interface GenerationPlanSnapshot {
  id: string;
  project_id: string;
  version: number;
  status: 'draft' | 'confirmed';
  segment_ids: string[];
  requirement_ids: string[];
  reference_ids: string[];
  missing_reference_ids: string[];
  confirmed_at?: string;
  confirmed_by?: string;
}

export interface SegmentPlan {
  id: string;
  project_id: string;
  order: number;
  title: string;
  duration_seconds: number;
  prompt: string;
  negative_prompt?: string;
  shot_description: string;
  continuity_notes?: string;
  reference_video_ids: string[];
  reference_image_ids: string[];
  reference_audio_ids: string[];
}

export interface GenerationProgress {
  id: string;
  project_id: string;
  segment_id: string;
  provider_task_id?: string;
  status: 'pending' | 'submitted' | 'running' | 'succeeded' | 'failed' | 'retrying';
  request_summary: {
    duration?: number;
    reference_counts?: {
      video?: number;
      image?: number;
      audio?: number;
    };
  };
  retry_count: number;
  error_message?: string;
  result_url?: string;
  created_at: string;
  updated_at: string;
}

export interface FinalResult {
  id: string;
  project_id: string;
  status: 'not_started' | 'running' | 'succeeded' | 'failed';
  output_file_id?: string;
  preview_url?: string;
  download_url?: string;
  duration_seconds?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}


export type MaterialStatus = 'received' | 'preprocessed' | 'tagged' | 'indexed' | 'searchable' | 'blocked' | 'failed';
export type MaterialAssetType = 'image' | 'video' | 'audio' | 'text' | 'project' | 'other';
export type MaterialLibraryType = 'raw' | 'finished' | 'knowledge';
export type MaterialCopyrightStatus = 'cleared' | 'licensed' | 'unknown' | 'risk';
export type MaterialComplianceStatus = 'approved' | 'pending' | 'risk';
export type MaterialVisibility = 'private' | 'brand' | 'public';
export type MaterialTagCategory = 'content' | 'business' | 'management' | 'effect';
export type MaterialTagSource = 'ai' | 'human' | 'system';
export type MaterialIndexStatus = 'pending' | 'indexed' | 'failed';

export interface MaterialAsset {
  id: string;
  status: MaterialStatus;
  asset_type: MaterialAssetType;
  library_type: MaterialLibraryType;
  copyright_status: MaterialCopyrightStatus;
  compliance_status: MaterialComplianceStatus;
  visibility: MaterialVisibility;
  owner_id?: string | null;
  brand_id?: string | null;
  title?: string | null;
  description?: string | null;
  filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  source_uri?: string | null;
  source_system?: string | null;
  md5?: string | null;
  duplicate_of?: string | null;
  source_metadata: Record<string, unknown>;
  technical_metadata: Record<string, unknown>;
  effect_metrics: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface MaterialTag {
  id: string;
  material_id: string;
  category: MaterialTagCategory;
  name: string;
  value?: string | null;
  confidence: number;
  source: MaterialTagSource;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialVectorIndex {
  id?: string;
  material_id?: string;
  status: MaterialIndexStatus;
  index_id?: string | null;
  collection?: string | null;
  partition_key?: string | null;
  embedding_model?: string | null;
  embedding_version?: string | null;
  vector_dim?: number | null;
  metadata?: Record<string, unknown>;
  error_message?: string | null;
  indexed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MaterialAuditEvent {
  id: string;
  material_id: string;
  action: string;
  actor?: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ParsedMaterialQuery {
  intent: 'search' | 'similar' | 'question' | string;
  terms: string[];
  normalized_query: string;
}

export interface MaterialRagAnswer {
  answer: string;
  citations: string[];
  fallback: boolean;
}

export interface MaterialSearchResult {
  material: MaterialAsset;
  score: number;
  vector_score?: number | null;
  scalar_score?: number | null;
  evidence: string[];
  matched_tags: string[];
  tags?: MaterialTag[];
  index?: MaterialVectorIndex | null;
  audit_events?: MaterialAuditEvent[];
}

export interface MaterialSearchResponse {
  query?: ParsedMaterialQuery;
  results?: MaterialSearchResult[];
  answer?: MaterialRagAnswer | null;
  error?: { message?: string };
}

export interface MaterialInsight {
  id: string;
  material_id?: string | null;
  title: string;
  method: string;
  script_template?: string | null;
  prompt?: string | null;
  source_material_ids: string[];
  metrics_snapshot: Record<string, number>;
  created_at: string;
  updated_at: string;
}
