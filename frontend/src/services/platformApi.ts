import request from '../utils/request'
import type { ProcessingRunResponse } from './resumeWorkflowApi'

export type UserRole = 'applicant' | 'hr' | 'admin'
export type EducationLevel = 'high_school' | 'associate' | 'bachelor' | 'master' | 'doctor' | 'other' | 'unknown'
export type RequirementType = 'required' | 'bonus'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface AdminUser {
  id: string
  username: string
  display_name: string
  role: UserRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

export interface RecruitmentProject {
  id: string
  owner_user_id: string
  title: string
  description: string | null
  jd_source_type: string | null
  jd_file_id: string | null
  jd_parse_status: string
  jd_draft_payload: RecruitmentDraft
  confirmed_requirement_summary: Record<string, unknown>
  confirmed_requirement_sha256: string | null
  requirements_revision: number
  latest_jd_run_id: string | null
  candidate_counts: Record<string, number>
  latest_processing_run: Record<string, unknown> | null
  latest_match_run: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface RecruitmentDraftSkill {
  raw_name?: string
  name?: string
  canonical_name?: string
  capability_id?: string | null
  requirement_type: RequirementType
  importance: number
  evidence_quote?: string | null
  confidence?: number | null
}

export interface RecruitmentDraft {
  job_title?: string
  summary?: string | null
  responsibilities?: Array<string | { text: string; evidence_quote?: string }>
  minimum_education_level?: EducationLevel | null
  recommended_experience_months?: number | null
  requirements?: RecruitmentDraftSkill[]
  mapped_skills?: RecruitmentDraftSkill[]
  unmapped_skills?: RecruitmentDraftSkill[]
  validation_warnings?: string[]
  [key: string]: unknown
}

export interface RequirementPayload {
  job_title: string
  summary: string | null
  responsibilities: string[]
  minimum_education_level: EducationLevel | null
  recommended_experience_months: number | null
  requirements: Array<{ capability_id: string; requirement_type: RequirementType; importance: number }>
  unmapped_skills: Array<{ raw_name: string; requirement_type: RequirementType }>
}

export interface RecruitmentCandidate {
  id: string
  project_id: string
  display_name: string
  parse_status: 'uploaded' | 'processing' | 'ready' | 'failed'
  file_id: string
  latest_run_id: string | null
  created_at: string
  updated_at: string
}

export interface RecruitmentMatchRun {
  id: string
  project_id: string
  requirements_revision: number
  weight_version: string
  result_count: number
  skipped_count: number
  high_count: number
  medium_count: number
  low_count: number
  created_at: string
}

export interface RecruitmentMatchResult {
  candidate_id: string
  candidate_profile_id: string
  rank: number
  total_score: number
  match_level: 'high' | 'medium' | 'low'
  candidate: { id?: string; display_name?: string; [key: string]: unknown }
  dimension_scores: Record<string, { score?: number; status?: string; [key: string]: unknown }>
  gap_summary: Record<string, number>
  matched_capabilities?: Array<{ capability_id: string; canonical_name: string; [key: string]: unknown }>
  missing_capabilities?: Array<{ capability_id: string; canonical_name: string; [key: string]: unknown }>
  requirements_snapshot?: Record<string, unknown>
  weight_snapshot?: Record<string, unknown>
}

export interface DiscoveryRun {
  id: string
  status: string
  created_at: string
  candidate_count?: number
  [key: string]: unknown
}

export interface DiscoveryCandidate {
  id: string
  discovery_run_id: string
  candidate_name?: string
  suggested_name: string
  skill_names?: string[]
  support_job_count: number
  source_count: number
  quality_score?: number
  overall_candidate_score: number
  review_status?: string
  [key: string]: unknown
}

export interface ReviewProposal {
  id: string
  candidate_id: string
  review_status: 'pending' | 'needs_revision' | 'approved' | 'rejected'
  proposed_payload: {
    role_name: string
    core_responsibilities: string[]
    required_capability_ids: string[]
    bonus_capability_ids: string[]
    industry_scenarios: string[]
    match_policy?: { minimum_education_level?: EducationLevel | null; recommended_experience_months?: number | null } | null
    generation_source: string
    definition_status: string
    disclaimer: string
  }
  decisions?: Array<{ decision: string; comment: string | null; created_at: string; actor?: Record<string, unknown> }>
  created_at: string
  [key: string]: unknown
}

export interface ImportBatch {
  id: string
  source_code: string
  status: string
  total_rows: number
  accepted_rows: number
  rejected_rows: number
  created_at: string
  [key: string]: unknown
}

export interface CatalogImport {
  id: string
  import_type: string
  schema_version: string
  status: string
  total_rows?: number
  valid_rows?: number
  invalid_rows?: number
  created_at: string
  [key: string]: unknown
}

export interface GraphVersion {
  id: string
  version_no: number
  status: string
  proposal_id?: string
  created_at: string
  published_at?: string | null
  [key: string]: unknown
}

export interface CatalogCapability {
  id: string
  domain_code: string
  domain_name: string
  canonical_name: string
  description: string | null
  skill_type: string
  status: string
  source_type: string
}

export interface CatalogDomain {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  sort_order: number
}

export interface CatalogJobRole {
  id: string
  domain_code: string
  domain_name: string
  canonical_name: string
  description: string | null
  status: string
  source_type: string
}

export interface ProcessingError {
  id: string
  stage: string
  item_type: string | null
  item_id: string | null
  item_key: string | null
  error_code: string
  message: string
  retryable: boolean
  details: Record<string, unknown>
  occurred_at: string
}

export interface ImportRow {
  raw: {
    id: string
    row_number: number
    job_name: string | null
    company_name: string | null
    city_text: string | null
    parse_warnings: string[]
    [key: string]: unknown
  }
  normalized: {
    id: string
    normalized_title: string | null
    quality_score: number
    quality_flags: string[]
    [key: string]: unknown
  } | null
}

export interface ImportWarnings {
  summary: Record<string, number>
  rows: Array<{ row_number: number; code: string }>
}

const idempotencyKey = (scope: string) => `${scope}-${Date.now()}-${crypto.randomUUID()}`

export const listRecruitmentProjects = (q = '') =>
  request.get<RecruitmentProject[]>('/api/v1/recruitment-projects', { params: q ? { q } : undefined })

export const createRecruitmentProject = (payload: { title: string; description?: string | null }) =>
  request.post<RecruitmentProject>('/api/v1/recruitment-projects', payload)

export const getRecruitmentProject = (projectId: string) =>
  request.get<RecruitmentProject>(`/api/v1/recruitment-projects/${projectId}`)

export function submitRecruitmentJd(projectId: string, input: { text?: string; file?: File }) {
  const form = new FormData()
  if (input.text?.trim()) form.append('text', input.text.trim())
  if (input.file) form.append('file', input.file)
  return request.upload<{ project_id: string; run_id: string; run_url: string }>(
    `/api/v1/recruitment-projects/${projectId}/jd`,
    form,
    { headers: { 'Idempotency-Key': idempotencyKey('jd') } },
  )
}

export const replaceRecruitmentRequirements = (projectId: string, payload: RequirementPayload) =>
  request.put<RecruitmentProject>(`/api/v1/recruitment-projects/${projectId}/requirements`, payload)

export const confirmRecruitmentRequirements = (projectId: string) =>
  request.post<{ project_id: string; requirements_revision: number; reused: boolean; confirmed_at: string }>(
    `/api/v1/recruitment-projects/${projectId}/requirements/confirm`,
  )

export function uploadRecruitmentCandidates(projectId: string, files: File[]) {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  return request.upload<{ project_id: string; run_id: string; candidates: RecruitmentCandidate[] }>(
    `/api/v1/recruitment-projects/${projectId}/candidates`,
    form,
    { headers: { 'Idempotency-Key': idempotencyKey('candidates') } },
  )
}

export const listRecruitmentCandidates = (projectId: string) =>
  request.get<RecruitmentCandidate[]>(`/api/v1/recruitment-projects/${projectId}/candidates`, { params: { page_size: 100 } })

export const getRecruitmentCandidate = (projectId: string, candidateId: string) =>
  request.get<Record<string, unknown>>(`/api/v1/recruitment-projects/${projectId}/candidates/${candidateId}`)

export const createRecruitmentMatchRun = (projectId: string) =>
  request.post<{ reused: boolean; run: RecruitmentMatchRun; items: RecruitmentMatchResult[] }>(
    `/api/v1/recruitment-projects/${projectId}/match-runs`,
  )

export const listRecruitmentMatchRuns = (projectId: string) =>
  request.get<RecruitmentMatchRun[]>(`/api/v1/recruitment-projects/${projectId}/match-runs`)

export const listRecruitmentMatchResults = (projectId: string, runId: string) =>
  request.get<RecruitmentMatchResult[]>(`/api/v1/recruitment-projects/${projectId}/match-runs/${runId}/results`, { params: { page_size: 100 } })

export const getRecruitmentMatchResult = (projectId: string, runId: string, candidateId: string) =>
  request.get<RecruitmentMatchResult>(`/api/v1/recruitment-projects/${projectId}/match-runs/${runId}/results/${candidateId}`)

export const listDiscoveryRuns = () => request.get<DiscoveryRun[]>('/api/v1/discovery-runs')
export async function listDiscoveryCandidates(runId?: string) {
  const all: DiscoveryCandidate[] = []
  for (let page = 1; page <= 10; page += 1) {
    const chunk = await request.get<DiscoveryCandidate[]>('/api/v1/discovery-candidates', {
      params: runId
        ? { discovery_run_id: runId, page, page_size: 100 }
        : { page, page_size: 100 },
    })
    all.push(...chunk)
    if (chunk.length < 100) break
  }
  return all
}
export const getDiscoveryCandidate = (id: string) => request.get<DiscoveryCandidate>(`/api/v1/discovery-candidates/${id}`)
export const getDiscoveryEvidence = (id: string) => request.get<Array<Record<string, unknown>>>(`/api/v1/discovery-candidates/${id}/evidence`)
export const createReviewProposal = (candidateId: string) => request.post<ReviewProposal>('/api/v1/review-proposals', { candidate_id: candidateId })

export const listReviewProposals = (status?: ReviewProposal['review_status']) =>
  request.get<ReviewProposal[]>('/api/v1/review-proposals', { params: status ? { status, page_size: 100 } : { page_size: 100 } })
export const getReviewProposal = (id: string) => request.get<ReviewProposal>(`/api/v1/review-proposals/${id}`)
export const decideReviewProposal = (id: string, payload: { decision: 'approve' | 'revise' | 'reject'; comment?: string; after_payload?: ReviewProposal['proposed_payload'] }) =>
  request.post<ReviewProposal>(`/api/v1/review-proposals/${id}/decisions`, payload)

export const listAdminUsers = (params?: Record<string, unknown>) => request.get<Page<AdminUser>>('/api/v1/admin/users', { params })
export const createAdminUser = (payload: { username: string; display_name: string; role: UserRole; initial_password: string }) => request.post<AdminUser>('/api/v1/admin/users', payload)
export const updateAdminUser = (id: string, payload: Partial<Pick<AdminUser, 'display_name' | 'role' | 'is_active'>>) => request.patch<AdminUser>(`/api/v1/admin/users/${id}`, payload)
export const resetAdminPassword = (id: string, newPassword: string) => request.post<AdminUser>(`/api/v1/admin/users/${id}/reset-password`, { new_password: newPassword })
export const getSystemDependencies = () => request.get<Record<string, { status?: string; [key: string]: unknown } | string>>('/api/v1/admin/system/dependencies')
export const getSystemVersions = () => request.get<Record<string, unknown>>('/api/v1/admin/system/versions')

export const listImports = () => request.get<ImportBatch[]>('/api/v1/imports')
export const listImportRows = (id: string) => request.get<ImportRow[]>(`/api/v1/imports/${id}/rows`, { params: { page_size: 100 } })
export const getImportWarnings = (id: string) => request.get<ImportWarnings>(`/api/v1/imports/${id}/warnings`)
export function uploadImport(file: File, sourceCode: string, collectedAt: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('source_code', sourceCode)
  form.append('collected_at', collectedAt)
  form.append('source_format', 'auto')
  return request.upload<{ resource_id: string; run_id: string }>('/api/v1/imports', form, { headers: { 'Idempotency-Key': idempotencyKey('market-import') } })
}
export const reprocessImport = (id: string) => request.post<ProcessingRunResponse>(`/api/v1/imports/${id}/reprocess`, { pipeline_version: 'jd_normalization_v2' })
export const archiveImport = (id: string) => request.post<ImportBatch>(`/api/v1/imports/${id}/archive`)

export const listCatalogImports = () => request.get<CatalogImport[]>('/api/v1/catalog/imports')
export const listCatalogCapabilities = (includeCandidates = false) =>
  request.get<CatalogCapability[]>('/api/v1/catalog/capabilities', { params: includeCandidates ? { include_candidates: true } : undefined })
export const listCatalogDomains = () => request.get<CatalogDomain[]>('/api/v1/catalog/domains')
export const listCatalogJobRoles = (includeCandidates = false) =>
  request.get<CatalogJobRole[]>('/api/v1/catalog/job-roles', { params: includeCandidates ? { include_candidates: true } : undefined })
export function uploadCatalog(file: File, importType: 'capability' | 'job_role') {
  const form = new FormData()
  form.append('file', file)
  form.append('import_type', importType)
  form.append('schema_version', 'catalog_v1')
  form.append('mode', 'apply')
  return request.upload<CatalogImport>('/api/v1/catalog/imports', form)
}
export const createDiscoveryRun = (batchIds: string[]) => request.post<{ resource_id: string; run_id: string }>('/api/v1/discovery-runs', {
  batch_ids: batchIds,
  minimum_support_jobs: 3,
  minimum_source_count: 1,
  minimum_quality_score: 60,
  maximum_candidates: 50,
})

export const listGraphVersions = () => request.get<GraphVersion[]>('/api/v1/graph-versions')
export const createGraphVersion = (proposalId: string) => request.post<GraphVersion>('/api/v1/graph-versions', { proposal_id: proposalId })
export const publishGraphVersion = (versionId: string) => request.post<GraphVersion>(`/api/v1/graph-versions/${versionId}/publish`)

export const listProcessingRuns = (params?: Record<string, unknown>) =>
  request.get<ProcessingRunResponse[]>('/api/v1/processing-runs', { params: { page_size: 100, ...params } })
export const listProcessingErrors = (runId: string) =>
  request.get<ProcessingError[]>(`/api/v1/processing-runs/${runId}/errors`, { params: { page_size: 100 } })
export const retryProcessingRun = (runId: string) => request.post<ProcessingRunResponse>(`/api/v1/processing-runs/${runId}/retry`)
export const cancelProcessingRun = (runId: string) => request.post<ProcessingRunResponse>(`/api/v1/processing-runs/${runId}/cancel`)

export async function waitForRun(runId: string, onProgress?: (run: ProcessingRunResponse) => void) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const run = await request.get<ProcessingRunResponse>(`/api/v1/processing-runs/${runId}`)
    onProgress?.(run)
    if (run.status === 'completed' || run.status === 'waiting_review') return run
    if (['failed', 'cancelled', 'enqueue_failed'].includes(run.status)) {
      throw new Error(run.error_message || '后台任务执行失败')
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500))
  }
  throw new Error('后台任务等待超时，可在任务记录中继续查看')
}
