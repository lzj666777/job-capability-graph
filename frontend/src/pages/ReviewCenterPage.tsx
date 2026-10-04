import { useEffect, useState } from 'react'
import { Alert, Button, Empty, Input, Select, Tag, Timeline } from 'antd'
import { AuditOutlined, CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import AuthGate from '../components/AuthGate'
import {
  decideReviewProposal,
  getReviewProposal,
  listCatalogCapabilities,
  listReviewProposals,
  type CatalogCapability,
  type ReviewProposal,
} from '../services/platformApi'

const STATUS_OPTIONS = [
  { value: 'pending', label: '待审核' },
  { value: 'needs_revision', label: '待修改' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
]

function message(error: unknown) {
  const value = error as { apiMessage?: string; message?: string }
  return value.apiMessage || value.message || '操作失败，请稍后重试'
}

export default function ReviewCenterPage() {
  return (
    <AuthGate roles={['hr', 'admin']} title="岗位审核中心" description="使用 HR 或管理员账号登录，审核候选岗位定义及其证据。">
      <ReviewWorkspace />
    </AuthGate>
  )
}

function ReviewWorkspace() {
  const [status, setStatus] = useState<ReviewProposal['review_status']>('pending')
  const [items, setItems] = useState<ReviewProposal[]>([])
  const [selected, setSelected] = useState<ReviewProposal | null>(null)
  const [roleName, setRoleName] = useState('')
  const [responsibilities, setResponsibilities] = useState('')
  const [scenarios, setScenarios] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<CatalogCapability[]>([])

  const hydrate = (proposal: ReviewProposal) => {
    setSelected(proposal)
    setRoleName(proposal.proposed_payload.role_name)
    setResponsibilities(proposal.proposed_payload.core_responsibilities.join('\n'))
    setScenarios(proposal.proposed_payload.industry_scenarios.join('\n'))
    setComment('')
  }

  const load = async (nextStatus = status) => {
    setLoading(true)
    try {
      const proposals = await listReviewProposals(nextStatus)
      setItems(proposals)
      if (proposals[0]) hydrate(await getReviewProposal(proposals[0].id))
      else setSelected(null)
    } catch (value) {
      setError(message(value))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    listCatalogCapabilities(true).then(setCapabilities).catch((value) => setError(message(value)))
  }, [])

  const capabilityName = (id: string) => capabilities.find((item) => item.id === id)?.canonical_name || id

  const selectProposal = async (proposal: ReviewProposal) => {
    setWorking(true)
    try { hydrate(await getReviewProposal(proposal.id)) }
    catch (value) { setError(message(value)) }
    finally { setWorking(false) }
  }

  const decide = async (decision: 'approve' | 'revise' | 'reject') => {
    if (!selected) return
    if ((decision === 'reject' || decision === 'revise') && !comment.trim()) {
      setError('要求修改或驳回时必须填写审核意见')
      return
    }
    setWorking(true)
    setError(null)
    try {
      const afterPayload = decision === 'revise' ? {
        ...selected.proposed_payload,
        role_name: roleName.trim(),
        core_responsibilities: responsibilities.split('\n').map((item) => item.trim()).filter(Boolean),
        industry_scenarios: scenarios.split('\n').map((item) => item.trim()).filter(Boolean),
        generation_source: 'human_revision',
        definition_status: 'reviewed',
      } : undefined
      await decideReviewProposal(selected.id, {
        decision,
        comment: comment.trim() || undefined,
        after_payload: afterPayload,
      })
      setNotice(decision === 'approve' ? '提案已通过，可由管理员创建图谱版本。' : decision === 'reject' ? '提案已驳回并保留审核历史。' : '修改后的定义已保存，提案进入待再次确认状态。')
      await load(status)
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  return (
    <main className="workspace-page"><div className="workspace-wrap">
      <header className="workspace-header">
        <div className="workspace-header__icon"><AuditOutlined /></div>
        <div><h1>岗位定义审核中心</h1><p>所有通过、修改与驳回都会形成不可变审核记录，发布动作仍由管理员完成。</p></div>
        <Select value={status} options={STATUS_OPTIONS} onChange={(value) => { setStatus(value); void load(value) }} />
      </header>
      {(error || notice) && <Alert className="workspace-alert" type={error ? 'error' : 'success'} showIcon closable message={error || notice} onClose={() => { setError(null); setNotice(null) }} />}
      <div className="review-layout">
        <aside className="review-queue">
          <div className="section-title"><div><h2>审核队列</h2><p>{STATUS_OPTIONS.find((item) => item.value === status)?.label}</p></div><span>{items.length}</span></div>
          {items.map((item) => <button key={item.id} className={selected?.id === item.id ? 'is-active' : ''} onClick={() => void selectProposal(item)}><strong>{item.proposed_payload.role_name}</strong><span>{new Date(item.created_at).toLocaleString('zh-CN')}</span><Tag>{item.review_status}</Tag></button>)}
          {!loading && !items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前队列为空" />}
        </aside>
        <section className="review-editor">
          {!selected ? <Empty description="选择一个岗位提案" /> : <>
            <div className="section-title"><div><h2>{selected.proposed_payload.role_name}</h2><p>{selected.proposed_payload.disclaimer}</p></div><Tag color={selected.review_status === 'approved' ? 'green' : selected.review_status === 'rejected' ? 'red' : 'gold'}>{selected.review_status}</Tag></div>
            <div className="form-grid">
              <label className="form-grid__wide"><span>岗位名称</span><Input value={roleName} maxLength={200} onChange={(event) => setRoleName(event.target.value)} /></label>
              <label className="form-grid__wide"><span>核心职责（每行一条）</span><Input.TextArea value={responsibilities} autoSize={{ minRows: 4, maxRows: 10 }} maxLength={10000} onChange={(event) => setResponsibilities(event.target.value)} /></label>
              <label className="form-grid__wide"><span>行业场景（每行一条）</span><Input.TextArea value={scenarios} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={6000} onChange={(event) => setScenarios(event.target.value)} /></label>
              <label className="form-grid__wide"><span>审核意见</span><Input.TextArea value={comment} autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} placeholder="要求修改或驳回时必填" onChange={(event) => setComment(event.target.value)} /></label>
            </div>
            <div className="review-capabilities">
              <div><h3>必备 Capability</h3>{selected.proposed_payload.required_capability_ids.map((id) => <code key={id} title={id}>{capabilityName(id)}</code>)}</div>
              <div><h3>加分 Capability</h3>{selected.proposed_payload.bonus_capability_ids.map((id) => <code key={id} title={id}>{capabilityName(id)}</code>)}</div>
            </div>
            <div className="button-row"><Button type="primary" icon={<CheckOutlined />} loading={working} onClick={() => void decide('approve')}>通过</Button><Button icon={<EditOutlined />} loading={working} onClick={() => void decide('revise')}>保存修改</Button><Button danger icon={<CloseOutlined />} loading={working} onClick={() => void decide('reject')}>驳回</Button></div>
            {(selected.decisions?.length ?? 0) > 0 && <section className="decision-history"><h3>审核历史</h3><Timeline items={selected.decisions?.map((item) => ({ children: <div><strong>{item.decision}</strong><p>{item.comment || '未填写意见'}</p><small>{new Date(item.created_at).toLocaleString('zh-CN')}</small></div> }))} /></section>}
          </>}
        </section>
      </div>
    </div></main>
  )
}
