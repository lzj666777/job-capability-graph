import { useEffect, useState } from 'react'
import { Alert, Button, Empty, Select, Tag } from 'antd'
import { AuditOutlined, DatabaseOutlined, EyeOutlined, RiseOutlined } from '@ant-design/icons'
import AuthGate from '../components/AuthGate'
import {
  createReviewProposal,
  getDiscoveryCandidate,
  getDiscoveryEvidence,
  listDiscoveryCandidates,
  listDiscoveryRuns,
  type DiscoveryCandidate,
  type DiscoveryRun,
} from '../services/platformApi'

function message(error: unknown) {
  const value = error as { apiMessage?: string; message?: string }
  return value.apiMessage || value.message || '加载失败，请稍后重试'
}

export default function EmergingJobsPage() {
  return (
    <AuthGate roles={['hr', 'admin']} title="新兴岗位发现" description="该页面包含市场 JD 证据和待审岗位定义，仅向 HR 与管理员开放。">
      <DiscoveryWorkspace />
    </AuthGate>
  )
}

function DiscoveryWorkspace() {
  const [runs, setRuns] = useState<DiscoveryRun[]>([])
  const [runId, setRunId] = useState<string | undefined>()
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([])
  const [selected, setSelected] = useState<DiscoveryCandidate | null>(null)
  const [evidence, setEvidence] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async (nextRunId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const [runItems, candidateItems] = await Promise.all([
        listDiscoveryRuns(),
        listDiscoveryCandidates(nextRunId),
      ])
      setRuns(runItems)
      setCandidates(candidateItems)
      setRunId(nextRunId)
      setSelected(null)
      setEvidence([])
    } catch (value) {
      setError(message(value))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const inspect = async (candidate: DiscoveryCandidate) => {
    setWorking(true)
    setError(null)
    try {
      const [detail, rows] = await Promise.all([
        getDiscoveryCandidate(candidate.id),
        getDiscoveryEvidence(candidate.id),
      ])
      setSelected(detail)
      setEvidence(rows)
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const submit = async () => {
    if (!selected) return
    setWorking(true)
    setError(null)
    try {
      await createReviewProposal(selected.id)
      setNotice('候选岗位已送入审核中心。')
      setCandidates((items) => items.map((item) => item.id === selected.id ? { ...item, status: 'submitted' } : item))
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  return (
    <main className="workspace-page"><div className="workspace-wrap">
      <header className="workspace-header">
        <div className="workspace-header__icon"><RiseOutlined /></div>
        <div><h1>新兴岗位发现</h1><p>从已归一化市场 JD 中查看候选技能组合，核验证据后再进入人工审核。</p></div>
        <Select
          allowClear
          loading={loading}
          value={runId}
          placeholder="全部发现批次"
          onChange={(value) => void load(value)}
          options={runs.map((run) => ({ value: run.id, label: `${run.status} · ${new Date(run.created_at).toLocaleDateString('zh-CN')}` }))}
        />
      </header>
      {(error || notice) && <Alert className="workspace-alert" type={error ? 'error' : 'success'} showIcon closable message={error || notice} onClose={() => { setError(null); setNotice(null) }} />}
      <div className="discovery-layout">
        <section className="candidate-browser" aria-busy={loading}>
          <div className="section-title"><div><h2>候选技能组合</h2><p>分数仅表示市场共现证据，不等同于已确认的新岗位。</p></div><span>{candidates.length} 项</span></div>
          {candidates.map((candidate) => (
            <button key={candidate.id} className={`discovery-candidate${selected?.id === candidate.id ? ' is-active' : ''}`} onClick={() => void inspect(candidate)}>
              <div><strong>{candidate.suggested_name || candidate.candidate_name || '未命名候选岗位'}</strong><span>{candidate.support_job_count} 条岗位 · {candidate.source_count} 个来源</span></div>
              <div><b>{Math.round(Number(candidate.overall_candidate_score ?? candidate.quality_score ?? 0) * 100)}%</b><EyeOutlined /></div>
            </button>
          ))}
          {!loading && !candidates.length && <Empty description="当前筛选条件下没有候选岗位" />}
        </section>
        <section className="candidate-inspector">
          {!selected ? <Empty description="选择一个候选岗位查看定义和证据" /> : <>
            <div className="section-title"><div><h2>{selected.suggested_name || selected.candidate_name}</h2><p>{String(selected.disclaimer || '候选结果需经人工审核后才能发布。')}</p></div><Tag color="gold">{String(selected.novelty_status || selected.status || 'candidate')}</Tag></div>
            <div className="score-strip">
              {Object.entries((selected.scores as Record<string, number> | undefined) ?? {}).map(([key, value]) => <span key={key}><small>{key}</small><strong>{Math.round(value * 100)}%</strong></span>)}
            </div>
            <div className="inspector-block"><h3>能力组合</h3><div className="capability-chip-list">{((selected.skills as Array<{ capability_id: string; canonical_name: string; skill_role: string }> | undefined) ?? []).map((skill) => <span key={skill.capability_id}>{skill.canonical_name} · {skill.skill_role}</span>)}</div></div>
            <div className="inspector-block"><h3>原始技术词</h3><div className="capability-chip-list">{([...(selected.required_skill_names as string[] | undefined ?? []), ...(selected.bonus_skill_names as string[] | undefined ?? [])]).map((skill) => <span key={skill}>{skill}</span>)}</div></div>
            <div className="inspector-block"><h3>行业场景</h3><div className="capability-chip-list">{((selected.industries as string[] | undefined) ?? []).map((industry) => <span key={industry}>{industry}</span>)}</div></div>
            <div className="inspector-block"><h3><DatabaseOutlined /> 市场证据</h3>{evidence.map((row, index) => <div className="evidence-row" key={String(row.normalized_job_id ?? index)}><div><strong>{String(row.job_title || '未命名岗位')}</strong><span>{String(row.company_name || '公司未公开')} · {String(row.source_code || 'unknown')}</span></div><Tag>{Math.round(Number(row.evidence_weight || 0) * 100)}%</Tag></div>)}{!evidence.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可见证据" />}</div>
            <Button type="primary" size="large" icon={<AuditOutlined />} loading={working} onClick={() => void submit()}>创建人工审核提案</Button>
          </>}
        </section>
      </div>
    </div></main>
  )
}
