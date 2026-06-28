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
  needs_brief_input?: boolean;
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
  needs_brief_input?: boolean;
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
