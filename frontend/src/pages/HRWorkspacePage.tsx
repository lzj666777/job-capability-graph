import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Input, InputNumber, Select, Slider, Table, Tabs, Tag, Upload } from 'antd'
import type { UploadFile } from 'antd'
import { CheckCircleOutlined, CloudUploadOutlined, FileSearchOutlined, FolderAddOutlined, ReloadOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import AuthGate from '../components/AuthGate'
import { FrameCorners } from '../components/FrameCorners'
import {
  confirmRecruitmentRequirements, createRecruitmentMatchRun, createRecruitmentProject,
  getRecruitmentMatchResult, getRecruitmentProject, listRecruitmentCandidates,
  listRecruitmentMatchResults, listRecruitmentMatchRuns, listRecruitmentProjects,
  replaceRecruitmentRequirements, submitRecruitmentJd, uploadRecruitmentCandidates,
  waitForRun, type EducationLevel, type RecruitmentCandidate, type RecruitmentDraftSkill,
  type RecruitmentMatchResult, type RecruitmentMatchRun, type RecruitmentProject,
  type RequirementPayload,
} from '../services/platformApi'
import type { ProcessingRunResponse } from '../services/resumeWorkflowApi'

const { Dragger } = Upload
const EDUCATION_OPTIONS = [
  ['high_school', '高中'], ['associate', '专科'], ['bachelor', '本科'], ['master', '硕士'],
  ['doctor', '博士'], ['other', '其他'], ['unknown', '未知'],
].map(([value, label]) => ({ value, label }))

function errorMessage(error: unknown) {
  const value = error as { apiMessage?: string; message?: string }
  return value.apiMessage || value.message || '请求失败，请稍后重试'
}

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '暂无'
}

function requirementsFrom(project: RecruitmentProject): RecruitmentDraftSkill[] {
  const draft = project.jd_draft_payload
  return [...(draft.requirements ?? []), ...(draft.mapped_skills ?? [])].filter(
    (item, index, values) => item.capability_id && values.findIndex((value) => value.capability_id === item.capability_id) === index,
  )
}

function responsibilitiesFrom(project: RecruitmentProject) {
  return (project.jd_draft_payload.responsibilities ?? []).map((item) => typeof item === 'string' ? item : item.text)
}

export default function HRWorkspacePage() {
  return (
    <AuthGate roles={['hr', 'admin']} title="HR 工作台" description="使用 HR 或管理员账号登录，继续岗位要求和候选人匹配。">
      <HRWorkspace />
    </AuthGate>
  )
}

function HRWorkspace() {
  const [projects, setProjects] = useState<RecruitmentProject[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [project, setProject] = useState<RecruitmentProject | null>(null)
  const [activeTab, setActiveTab] = useState('jd')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [jdText, setJdText] = useState('')
  const [jdFile, setJdFile] = useState<UploadFile[]>([])
  const [task, setTask] = useState<ProcessingRunResponse | null>(null)
  const [requirements, setRequirements] = useState<RecruitmentDraftSkill[]>([])
  const [unmapped, setUnmapped] = useState<RecruitmentDraftSkill[]>([])
  const [jobTitle, setJobTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [responsibilities, setResponsibilities] = useState<string[]>([])
  const [education, setEducation] = useState<EducationLevel | null>(null)
  const [experienceMonths, setExperienceMonths] = useState<number | null>(null)
  const [candidateFiles, setCandidateFiles] = useState<UploadFile[]>([])
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([])
  const [matchRuns, setMatchRuns] = useState<RecruitmentMatchRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [results, setResults] = useState<RecruitmentMatchResult[]>([])
  const [selectedResult, setSelectedResult] = useState<RecruitmentMatchResult | null>(null)

  const hydrateDraft = (value: RecruitmentProject) => {
    const draft = value.jd_draft_payload
    setJobTitle(draft.job_title || value.title)
    setSummary(draft.summary || '')
    setResponsibilities(responsibilitiesFrom(value))
    setEducation(draft.minimum_education_level || null)
    setExperienceMonths(draft.recommended_experience_months ?? null)
    setRequirements(requirementsFrom(value))
    setUnmapped(draft.unmapped_skills ?? [])
  }

  const loadProject = async (id: string) => {
    const [detail, candidateItems, runItems] = await Promise.all([
      getRecruitmentProject(id), listRecruitmentCandidates(id), listRecruitmentMatchRuns(id),
    ])
    setProject(detail)
    setCandidates(candidateItems)
    setMatchRuns(runItems)
    setProjectId(id)
    hydrateDraft(detail)
    const runId = selectedRunId && runItems.some((run) => run.id === selectedRunId) ? selectedRunId : runItems[0]?.id
    setSelectedRunId(runId || null)
    setResults(runId ? await listRecruitmentMatchResults(id, runId) : [])
  }

  const loadProjects = async (preferredId?: string) => {
    const items = await listRecruitmentProjects()
    setProjects(items)
    const nextId = preferredId || projectId || items[0]?.id || null
    setProjectId(nextId)
    if (nextId) await loadProject(nextId)
    else setProject(null)
  }

  useEffect(() => {
    loadProjects().catch((value) => setError(errorMessage(value))).finally(() => setLoading(false))
    // Initial load only; later refreshes are explicit to preserve the selected snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createProject = async () => {
    if (!newTitle.trim()) return
    setWorking(true); setError(null)
    try {
      const created = await createRecruitmentProject({ title: newTitle.trim(), description: newDescription.trim() || null })
      setNewTitle(''); setNewDescription('')
      await loadProjects(created.id)
      setNotice('招聘项目已创建，请提交 JD 进行解析。'); setActiveTab('jd')
    } catch (value) { setError(errorMessage(value)) } finally { setWorking(false) }
  }

  const submitJd = async () => {
    if (!project || (!jdText.trim() && !jdFile[0]?.originFileObj)) return
    setWorking(true); setError(null); setNotice(null); setTask(null)
    try {
      const response = await submitRecruitmentJd(project.id, { text: jdText.trim() || undefined, file: jdFile[0]?.originFileObj as File | undefined })
      await waitForRun(response.run_id, setTask)
      await loadProject(project.id)
      setNotice('JD 已解析为可编辑要求，请校准后确认。'); setActiveTab('requirements')
    } catch (value) { setError(errorMessage(value)) } finally { setWorking(false) }
  }

  const requirementPayload = (): RequirementPayload => ({
    job_title: jobTitle.trim(), summary: summary.trim() || null,
    responsibilities: responsibilities.map((item) => item.trim()).filter(Boolean),
    minimum_education_level: education, recommended_experience_months: experienceMonths,
    requirements: requirements.flatMap((item) => item.capability_id ? [{
      capability_id: item.capability_id, requirement_type: item.requirement_type,
      importance: Math.max(0.01, Math.min(1, item.importance || 0.5)),
    }] : []),
    unmapped_skills: unmapped.flatMap((item) => {
      const rawName = item.raw_name || item.name
      return rawName?.trim() ? [{ raw_name: rawName.trim(), requirement_type: item.requirement_type }] : []
    }),
  })

  const saveAndConfirm = async () => {
    if (!project || !jobTitle.trim()) return
    if (!requirements.some((item) => item.capability_id && item.requirement_type === 'required')) {
      setError('至少保留一个已映射的必备能力'); return
    }
    setWorking(true); setError(null)
    try {
      await replaceRecruitmentRequirements(project.id, requirementPayload())
      const confirmed = await confirmRecruitmentRequirements(project.id)
      await loadProject(project.id)
      setNotice(confirmed.reused ? '要求未变化，已复用原确认版本。' : `已确认第 ${confirmed.requirements_revision} 版岗位要求。`)
      setActiveTab('candidates')
    } catch (value) { setError(errorMessage(value)) } finally { setWorking(false) }
  }

  const uploadCandidates = async () => {
    if (!project) return
    const files = candidateFiles.flatMap((item) => item.originFileObj ? [item.originFileObj as File] : [])
    if (files.length < 1 || files.length > 20) return
    setWorking(true); setError(null); setTask(null)
    try {
      const response = await uploadRecruitmentCandidates(project.id, files)
      await waitForRun(response.run_id, setTask)
      setCandidateFiles([]); await loadProject(project.id)
      setNotice('候选人解析已完成；失败项会在匹配快照中标记为跳过。')
    } catch (value) { setError(errorMessage(value)) } finally { setWorking(false) }
  }

  const runMatch = async () => {
    if (!project) return
    setWorking(true); setError(null)
    try {
      const response = await createRecruitmentMatchRun(project.id)
      setSelectedRunId(response.run.id); setResults(response.items)
      setMatchRuns(await listRecruitmentMatchRuns(project.id))
      setNotice(response.reused ? '输入未变化，已复用上次匹配快照。' : '已生成新的候选人匹配快照。'); setActiveTab('results')
    } catch (value) { setError(errorMessage(value)) } finally { setWorking(false) }
  }

  const showResult = async (row: RecruitmentMatchResult) => {
    if (!project || !selectedRunId) return
    try { setSelectedResult(await getRecruitmentMatchResult(project.id, selectedRunId, row.candidate_id)) }
    catch (value) { setError(errorMessage(value)) }
  }

  const switchRun = async (runId: string) => {
    if (!project) return
    setSelectedRunId(runId); setSelectedResult(null)
    setResults(await listRecruitmentMatchResults(project.id, runId))
  }

  const readyCount = candidates.filter((candidate) => candidate.parse_status === 'ready').length
  const hasConfirmedRequirements = Boolean(project?.confirmed_requirement_sha256)
  const requirementStats = useMemo(() => ({
    required: requirements.filter((item) => item.requirement_type === 'required').length,
    bonus: requirements.filter((item) => item.requirement_type === 'bonus').length,
  }), [requirements])

  return (
    <main className="workspace-page"><div className="workspace-wrap">
      <header className="workspace-header">
        <div className="workspace-header__icon"><TeamOutlined /></div>
        <div><h1>HR 招聘匹配工作台</h1><p>从 JD 解析、要求确认到候选人排名，全程使用后端不可变快照。</p></div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadProjects().catch((value) => setError(errorMessage(value)))}>刷新</Button>
      </header>
      {(error || notice) && <Alert className="workspace-alert" closable onClose={() => { setError(null); setNotice(null) }} type={error ? 'error' : 'success'} showIcon message={error || notice} />}
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <h2>招聘项目</h2>
          <div className="project-create">
            <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="项目名称" maxLength={200} />
            <Input.TextArea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="项目说明（可选）" autoSize={{ minRows: 2, maxRows: 4 }} maxLength={5000} />
            <Button block icon={<FolderAddOutlined />} disabled={!newTitle.trim()} loading={working} onClick={() => void createProject()}>创建项目</Button>
          </div>
          <div className="project-list">
            {projects.map((item) => <button key={item.id} className={item.id === projectId ? 'is-active' : ''} onClick={() => loadProject(item.id).catch((value) => setError(errorMessage(value)))}><strong>{item.title}</strong><span>{item.requirements_revision ? `要求 v${item.requirements_revision}` : '待确认要求'} · {item.candidate_counts.total ?? 0} 人</span></button>)}
            {!loading && projects.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有招聘项目" />}
          </div>
        </aside>
        <section className="workspace-content">
          {!project ? <Empty description="创建或选择一个招聘项目" /> : <>
            <div className="project-summary"><div><strong>{project.title}</strong><span>{project.description || '未填写项目说明'}</span></div><div className="project-summary__metrics"><span><b>{project.requirements_revision}</b>要求版本</span><span><b>{readyCount}</b>可匹配候选人</span><span><b>{matchRuns.length}</b>匹配快照</span></div></div>
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
              { key: 'jd', label: '1. JD 解析', children: <div className="workflow-section">
                <SectionTitle title="提交岗位 JD" description="文本和文件二选一，后台将异步抽取职责、门槛和技能证据。" />
                <Input.TextArea value={jdText} onChange={(event) => setJdText(event.target.value)} rows={10} maxLength={30000} placeholder="粘贴岗位职责、任职要求和技能要求" disabled={jdFile.length > 0} />
                <Dragger accept=".pdf,.docx,.txt" maxCount={1} fileList={jdFile} beforeUpload={() => false} onChange={({ fileList }) => { setJdFile(fileList.slice(-1)); if (fileList.length) setJdText('') }}><p className="ant-upload-drag-icon"><CloudUploadOutlined /></p><p className="ant-upload-text">或上传 PDF / DOCX / TXT JD</p></Dragger>
                {task && <TaskProgress run={task} />}<Button type="primary" size="large" icon={<FileSearchOutlined />} loading={working} disabled={!jdText.trim() && !jdFile.length} onClick={() => void submitJd()}>解析 JD</Button>
              </div> },
              { key: 'requirements', label: `2. 要求确认 (${requirements.length})`, disabled: !project.jd_draft_payload.job_title, children: <div className="workflow-section">
                <div className="section-title"><div><h2>校准岗位要求</h2><p>确认后生成不可变 revision，后续匹配始终引用该快照。</p></div><Tag color={hasConfirmedRequirements ? 'green' : 'gold'}>{hasConfirmedRequirements ? `已确认 v${project.requirements_revision}` : '待确认'}</Tag></div>
                <div className="form-grid">
                  <label><span>岗位名称</span><Input value={jobTitle} maxLength={200} onChange={(event) => setJobTitle(event.target.value)} /></label>
                  <label><span>最低学历</span><Select allowClear value={education} options={EDUCATION_OPTIONS} onChange={setEducation} /></label>
                  <label><span>建议经验（月）</span><InputNumber min={0} max={600} value={experienceMonths} onChange={setExperienceMonths} /></label>
                  <label className="form-grid__wide"><span>岗位摘要</span><Input.TextArea value={summary} maxLength={1000} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => setSummary(event.target.value)} /></label>
                  <label className="form-grid__wide"><span>核心职责（每行一条）</span><Input.TextArea value={responsibilities.join('\n')} maxLength={5000} autoSize={{ minRows: 3, maxRows: 8 }} onChange={(event) => setResponsibilities(event.target.value.split('\n'))} /></label>
                </div>
                <div className="requirement-list"><div className="requirement-list__head"><strong>已映射能力</strong><span>必备 {requirementStats.required} · 加分 {requirementStats.bonus}</span></div>{requirements.map((item, index) => <div className="requirement-row" key={item.capability_id || `${item.raw_name}-${index}`}><div><strong>{item.canonical_name || item.raw_name || item.name}</strong><small>{item.evidence_quote || '人工校准项'}</small></div><Select value={item.requirement_type} options={[{ value: 'required', label: '必备' }, { value: 'bonus', label: '加分' }]} onChange={(value) => setRequirements((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, requirement_type: value } : row))} /><div className="importance-control"><span>重要度 {Math.round((item.importance || 0) * 100)}%</span><Slider min={1} max={100} value={Math.round((item.importance || 0.5) * 100)} onChange={(value) => setRequirements((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, importance: value / 100 } : row))} /></div></div>)}</div>
                {unmapped.length > 0 && <Alert type="warning" showIcon message={`${unmapped.length} 项技能未命中标准 Capability`} description={unmapped.map((item) => item.raw_name || item.name).join('、')} />}
                <Button type="primary" size="large" icon={<CheckCircleOutlined />} loading={working} onClick={() => void saveAndConfirm()}>保存并确认要求</Button>
              </div> },
              { key: 'candidates', label: `3. 候选人 (${candidates.length})`, disabled: !hasConfirmedRequirements, children: <div className="workflow-section">
                <SectionTitle title="候选人简历" description="每批 1–20 份 PDF/DOCX，单份失败不会回滚已成功结果。" />
                <Dragger multiple accept=".pdf,.docx" fileList={candidateFiles} beforeUpload={() => false} onChange={({ fileList }) => setCandidateFiles(fileList.slice(0, 20))}><p className="ant-upload-drag-icon"><CloudUploadOutlined /></p><p className="ant-upload-text">拖入候选人简历</p><p className="ant-upload-hint">已选 {candidateFiles.length} / 20 份</p></Dragger>
                {task && <TaskProgress run={task} />}<div className="button-row"><Button type="primary" loading={working} disabled={!candidateFiles.length} onClick={() => void uploadCandidates()}>上传并解析</Button><Button disabled={!readyCount || working} onClick={() => void runMatch()}>生成匹配快照</Button></div>
                <div className="candidate-list">{candidates.map((candidate) => <div key={candidate.id}><UserOutlined /><strong>{candidate.display_name}</strong><Tag color={candidate.parse_status === 'ready' ? 'green' : candidate.parse_status === 'failed' ? 'red' : 'gold'}>{candidate.parse_status}</Tag><span>{formatDate(candidate.updated_at)}</span></div>)}</div>
              </div> },
              { key: 'results', label: `4. 匹配结果 (${results.length})`, disabled: !matchRuns.length, children: <div className="workflow-section">
                <div className="section-title"><div><h2>候选人排名</h2><p>切换历史快照不会用当前 JD 或候选人数据覆盖旧结果。</p></div><Select className="run-select" value={selectedRunId} onChange={(value) => void switchRun(value)} options={matchRuns.map((run) => ({ value: run.id, label: `${formatDate(run.created_at)} · ${run.result_count} 人` }))} /></div>
                <Table rowKey="candidate_id" pagination={false} dataSource={results} onRow={(row) => ({ onClick: () => void showResult(row) })} columns={[
                  { title: '排名', dataIndex: 'rank', width: 72, render: (value: number) => `#${value}` },
                  { title: '候选人', render: (_value, row) => row.candidate.display_name || row.candidate_id },
                  { title: '匹配等级', dataIndex: 'match_level', render: (value: string) => <Tag color={value === 'high' ? 'green' : value === 'medium' ? 'gold' : 'red'}>{value}</Tag> },
                  { title: '总分', dataIndex: 'total_score', render: (value: number) => <strong>{value.toFixed(1)}</strong> },
                  { title: '缺口', render: (_value, row) => row.gap_summary.missing_required_count ?? 0 },
                ]} />
                {selectedResult && <ResultDetail result={selectedResult} />}
              </div> },
            ]} />
          </>}
        </section>
      </div>
    </div></main>
  )
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div className="section-title"><div><h2>{title}</h2><p>{description}</p></div></div>
}

function TaskProgress({ run }: { run: ProcessingRunResponse }) {
  return <div className="task-progress"><span style={{ width: `${Math.max(0, Math.min(100, run.progress_percent))}%` }} /><strong>{run.current_stage || run.status}</strong><em>{Math.round(run.progress_percent)}%</em></div>
}

function ResultDetail({ result }: { result: RecruitmentMatchResult }) {
  const matched = result.matched_capabilities ?? []
  const missing = result.missing_capabilities ?? []
  return <section className="result-detail"><FrameCorners /><div className="section-title"><div><h3>{result.candidate.display_name || '候选人'} · 匹配明细</h3><p>得分来自该次不可变的岗位要求和候选人画像快照。</p></div><strong className="result-detail__score">{result.total_score.toFixed(1)}</strong></div><div className="result-detail__grid"><div><h4>已命中能力</h4>{matched.length ? matched.map((item) => <span key={item.capability_id}>{item.canonical_name}</span>) : <small>无</small>}</div><div><h4>缺失能力</h4>{missing.length ? missing.map((item) => <span key={item.capability_id}>{item.canonical_name}</span>) : <small>无必备能力缺口</small>}</div></div></section>
}
