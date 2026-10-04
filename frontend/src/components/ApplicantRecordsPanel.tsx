import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Input, InputNumber, Modal, Popconfirm, Select, Spin, Tag } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import {
  archiveResume,
  createResumeProfileRevision,
  getRecommendationRun,
  getResumeProfile,
  listRecommendationRuns,
  listResumeProfiles,
  listResumes,
  replaceResumeProfileDraft,
  type ManualProfileReplacePayload,
  type RecommendationCreateResponse,
  type ResumeProfileDetail,
  type ResumeProfileSummary,
  type ResumeSkillRecord,
  type ResumeSummary,
} from '../services/resumeWorkflowApi'
import { listCatalogCapabilities, type CatalogCapability } from '../services/platformApi'

interface ApplicantRecordsPanelProps {
  refreshKey?: number
  onOpenProfile: (profile: ResumeProfileDetail) => void
  onOpenRecommendation: (profile: ResumeProfileDetail, recommendation: RecommendationCreateResponse) => void
}

type EditableSkill = Pick<
  ResumeSkillRecord,
  'raw_name' | 'capability_id' | 'proficiency' | 'explicit_experience_months' | 'evidence_strength' | 'evidence_quote'
> & { client_id: string }

function message(error: unknown) {
  const value = error as { apiMessage?: string; message?: string }
  return value.apiMessage || value.message || '请求失败，请稍后重试'
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '暂无'
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function dateFields(value: Record<string, unknown>) {
  return {
    start_month: pickString(value.start_month),
    end_month: value.is_current ? null : pickString(value.end_month),
    is_current: Boolean(value.is_current),
  }
}

function buildPayload(profile: ResumeProfileDetail, summary: string, skills: EditableSkill[]): ManualProfileReplacePayload {
  const source = profile.profile
  const records = (key: string) => Array.isArray(source[key]) ? source[key] as Array<Record<string, unknown>> : []
  return {
    document_language: pickString(source.document_language) || 'zh-CN',
    summary: summary.trim() || null,
    educations: records('educations').map((item) => ({
      ...dateFields(item),
      school_name: pickString(item.school_name) || '未注明学校',
      major: pickString(item.major),
      education_level: pickString(item.education_level) || 'unknown',
      evidence_quote: pickString(item.evidence_quote),
    })),
    experiences: records('experiences').map((item) => ({
      ...dateFields(item),
      company_name: pickString(item.company_name) || '未注明单位',
      job_title: pickString(item.job_title),
      responsibilities: Array.isArray(item.responsibilities)
        ? item.responsibilities.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [],
      evidence_quote: pickString(item.evidence_quote),
    })),
    projects: records('projects').map((item) => ({
      ...dateFields(item),
      project_name: pickString(item.project_name) || '未命名项目',
      role: pickString(item.role),
      description: pickString(item.description),
      evidence_quote: pickString(item.evidence_quote),
    })),
    skills: skills
      .filter((skill) => skill.raw_name.trim())
      .map((skill) => ({
        raw_name: skill.raw_name.trim(),
        capability_id: skill.capability_id || null,
        proficiency: skill.proficiency || null,
        explicit_experience_months: skill.explicit_experience_months ?? null,
        evidence_strength: skill.evidence_strength,
        evidence_quote: pickString(skill.evidence_quote),
      })),
  }
}

export default function ApplicantRecordsPanel({ refreshKey, onOpenProfile, onOpenRecommendation }: ApplicantRecordsPanelProps) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([])
  const [selectedResume, setSelectedResume] = useState<ResumeSummary | null>(null)
  const [profiles, setProfiles] = useState<ResumeProfileSummary[]>([])
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof listRecommendationRuns>>['items']>([])
  const [capabilities, setCapabilities] = useState<CatalogCapability[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorProfile, setEditorProfile] = useState<ResumeProfileDetail | null>(null)
  const [editorSummary, setEditorSummary] = useState('')
  const [editorSkills, setEditorSkills] = useState<EditableSkill[]>([])

  const loadResumes = async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await listResumes()
      setResumes(items)
      if (selectedResume) {
        setSelectedResume(items.find((item) => item.id === selectedResume.id) || null)
      }
    } catch (value) {
      setError(message(value))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadResumes() }, [refreshKey])

  const inspectResume = async (resume: ResumeSummary) => {
    setSelectedResume(resume)
    setWorking(true)
    setError(null)
    try {
      const [profileItems, recommendationPage] = await Promise.all([
        listResumeProfiles(resume.id),
        listRecommendationRuns(resume.id),
      ])
      setProfiles(profileItems)
      setRuns(recommendationPage.items)
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const openProfile = async (resumeId: string, versionNo: number) => {
    setWorking(true)
    setError(null)
    try {
      onOpenProfile(await getResumeProfile(resumeId, versionNo))
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const openRecommendation = async (resume: ResumeSummary, runId: string, profileVersion: number) => {
    setWorking(true)
    setError(null)
    try {
      const [profile, recommendation] = await Promise.all([
        getResumeProfile(resume.id, profileVersion),
        getRecommendationRun(runId),
      ])
      onOpenRecommendation(profile, { reused: true, ...recommendation })
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const startRevision = async (summary: ResumeProfileSummary) => {
    if (!selectedResume) return
    setWorking(true)
    setError(null)
    try {
      const profile = summary.profile_source === 'manual_revision' && summary.status === 'draft'
        ? await getResumeProfile(selectedResume.id, summary.version_no)
        : await createResumeProfileRevision(selectedResume.id, summary.version_no)
      const catalog = capabilities.length ? capabilities : await listCatalogCapabilities()
      setCapabilities(catalog)
      setEditorProfile(profile)
      setEditorSummary(typeof profile.profile.summary === 'string' ? profile.profile.summary : '')
      setEditorSkills(profile.skills.map((skill) => ({
        client_id: skill.id,
        raw_name: skill.raw_name,
        capability_id: skill.capability_id,
        proficiency: skill.proficiency,
        explicit_experience_months: skill.explicit_experience_months,
        evidence_strength: skill.evidence_strength,
        evidence_quote: skill.evidence_quote,
      })))
      await inspectResume(selectedResume)
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const saveRevision = async () => {
    if (!editorProfile || !selectedResume) return
    if (!editorSkills.some((skill) => skill.raw_name.trim())) {
      setError('画像至少需要保留一项有效技能')
      return
    }
    setWorking(true)
    setError(null)
    try {
      const updated = await replaceResumeProfileDraft(
        selectedResume.id,
        editorProfile.version_no,
        buildPayload(editorProfile, editorSummary, editorSkills),
      )
      setEditorProfile(null)
      await inspectResume(selectedResume)
      onOpenProfile(updated)
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const capabilityOptions = useMemo(() => capabilities.map((item) => ({
    value: item.id,
    label: `${item.canonical_name} / ${item.domain_name}`,
  })), [capabilities])

  return (
    <section className="applicant-records" aria-labelledby="resume-history-title">
      <div className="applicant-records__head">
        <div>
          <span>PROFILE ARCHIVE</span>
          <h2 id="resume-history-title"><HistoryOutlined /> 我的简历与评估记录</h2>
        </div>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void loadResumes()}>刷新</Button>
      </div>

      {error && <Alert type="error" showIcon closable message={error} onClose={() => setError(null)} />}
      {loading ? <div className="applicant-records__loading"><Spin /> 正在读取档案</div> : !resumes.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无简历记录，上传后会保存在这里" />
      ) : (
        <div className="applicant-records__list">
          {resumes.map((resume) => (
            <button key={resume.id} type="button" className={selectedResume?.id === resume.id ? 'is-active' : ''} onClick={() => void inspectResume(resume)}>
              <FileSearchOutlined />
              <span><strong>{resume.display_name}</strong><small>{formatDate(resume.created_at)}</small></span>
              <Tag color={resume.parse_status === 'ready' ? 'green' : resume.parse_status === 'failed' ? 'red' : 'gold'}>{resume.parse_status}</Tag>
            </button>
          ))}
        </div>
      )}

      {selectedResume && (
        <div className="applicant-records__detail">
          <div className="applicant-records__detail-head">
            <div><strong>{selectedResume.display_name}</strong><span>画像版本 {profiles.length} · 推荐记录 {runs.length}</span></div>
            <Popconfirm title="归档这份简历？" description="归档后不再出现在默认列表中。" okText="归档" cancelText="取消" onConfirm={() => void (async () => {
              setWorking(true)
              try { await archiveResume(selectedResume.id); setSelectedResume(null); setProfiles([]); setRuns([]); await loadResumes() }
              catch (value) { setError(message(value)) }
              finally { setWorking(false) }
            })()}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={working}>归档</Button>
            </Popconfirm>
          </div>
          {working && <Spin size="small" />}
          <div className="applicant-records__columns">
            <div>
              <h3>画像版本</h3>
              {profiles.map((profile) => (
                <div className="applicant-records__row" key={profile.id}>
                  <div><strong>V{profile.version_no}</strong><span>{profile.profile_source === 'manual_revision' ? '人工修订' : 'AI 提取'} · {profile.status}</span></div>
                  <div>
                    <Button size="small" onClick={() => void openProfile(selectedResume.id, profile.version_no)}>打开</Button>
                    {['candidate', 'confirmed', 'draft'].includes(profile.status) && <Button size="small" icon={<EditOutlined />} onClick={() => void startRevision(profile)}>修订</Button>}
                  </div>
                </div>
              ))}
              {!profiles.length && <span className="applicant-records__empty">暂无画像版本</span>}
            </div>
            <div>
              <h3>岗位推荐历史</h3>
              {runs.map((run) => (
                <div className="applicant-records__row" key={run.id}>
                  <div><strong>{run.result_count} 个岗位</strong><span>画像 V{run.resume_profile.version_no} · {formatDate(run.created_at)}</span></div>
                  <Button size="small" icon={<RocketOutlined />} onClick={() => void openRecommendation(selectedResume, run.id, run.resume_profile.version_no)}>载入</Button>
                </div>
              ))}
              {!runs.length && <span className="applicant-records__empty">暂无推荐记录</span>}
            </div>
          </div>
        </div>
      )}

      <Modal
        width={920}
        title={editorProfile ? `修订画像 V${editorProfile.version_no}` : '修订画像'}
        open={Boolean(editorProfile)}
        confirmLoading={working}
        okText="保存草稿并打开"
        cancelText="取消"
        onOk={() => void saveRevision()}
        onCancel={() => setEditorProfile(null)}
      >
        <div className="profile-editor">
          <Alert type="info" showIcon message="教育、经历和项目沿用来源版本；此处可校正摘要、技能名称、标准能力映射与证据强度。" />
          <label><span>画像摘要</span><Input.TextArea value={editorSummary} maxLength={1000} autoSize={{ minRows: 3, maxRows: 7 }} onChange={(event) => setEditorSummary(event.target.value)} /></label>
          <div className="profile-editor__skills-head"><strong>技能记录</strong><Button size="small" icon={<PlusOutlined />} onClick={() => setEditorSkills((items) => [...items, { client_id: crypto.randomUUID(), raw_name: '', capability_id: null, proficiency: null, explicit_experience_months: null, evidence_strength: 'mention', evidence_quote: null }])}>添加技能</Button></div>
          <div className="profile-editor__skills">
            {editorSkills.map((skill, index) => (
              <div className="profile-editor__skill" key={skill.client_id}>
                <Input value={skill.raw_name} maxLength={200} placeholder="原始技能名称" onChange={(event) => setEditorSkills((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, raw_name: event.target.value } : item))} />
                <Select allowClear showSearch optionFilterProp="label" value={skill.capability_id || undefined} placeholder="标准能力映射" options={capabilityOptions} onChange={(value) => setEditorSkills((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, capability_id: value || null } : item))} />
                <Select allowClear value={skill.proficiency || undefined} placeholder="熟练度" options={[{ value: 'beginner', label: '初级' }, { value: 'intermediate', label: '中级' }, { value: 'advanced', label: '高级' }]} onChange={(value) => setEditorSkills((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, proficiency: value || null } : item))} />
                <Select value={skill.evidence_strength} options={[{ value: 'mention', label: '简历提及' }, { value: 'project', label: '项目证据' }, { value: 'work', label: '工作证据' }]} onChange={(value) => setEditorSkills((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, evidence_strength: value } : item))} />
                <InputNumber min={0} precision={0} value={skill.explicit_experience_months} placeholder="经验月数" onChange={(value) => setEditorSkills((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, explicit_experience_months: value } : item))} />
                <Input value={skill.evidence_quote || ''} maxLength={1000} placeholder="证据原文（可选）" onChange={(event) => setEditorSkills((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, evidence_quote: event.target.value || null } : item))} />
                <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除技能 ${skill.raw_name || index + 1}`} onClick={() => setEditorSkills((items) => items.filter((_item, itemIndex) => itemIndex !== index))} />
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </section>
  )
}
