import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Input, Modal, Progress, Select, Switch, Table, Tabs, Tag, Upload } from 'antd'
import type { UploadFile } from 'antd'
import {
  CloudUploadOutlined,
  CloseCircleOutlined,
  ControlOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UserAddOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import AuthGate from '../components/AuthGate'
import {
  archiveImport,
  cancelProcessingRun,
  createAdminUser,
  createDiscoveryRun,
  createGraphVersion,
  getSystemDependencies,
  getSystemVersions,
  getImportWarnings,
  listAdminUsers,
  listCatalogImports,
  listCatalogCapabilities,
  listCatalogDomains,
  listCatalogJobRoles,
  listDiscoveryRuns,
  listGraphVersions,
  listImports,
  listImportRows,
  listProcessingErrors,
  listProcessingRuns,
  listReviewProposals,
  publishGraphVersion,
  reprocessImport,
  retryProcessingRun,
  resetAdminPassword,
  updateAdminUser,
  uploadCatalog,
  uploadImport,
  type AdminUser,
  type CatalogImport,
  type CatalogCapability,
  type CatalogDomain,
  type CatalogJobRole,
  type DiscoveryRun,
  type GraphVersion,
  type ImportBatch,
  type ImportRow,
  type ImportWarnings,
  type ProcessingError,
  type ReviewProposal,
  type UserRole,
} from '../services/platformApi'
import type { ProcessingRunResponse } from '../services/resumeWorkflowApi'

function message(error: unknown) {
  const value = error as { apiMessage?: string; message?: string }
  return value.apiMessage || value.message || '操作失败，请稍后重试'
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '暂无'
}

export default function AdminCenterPage() {
  return (
    <AuthGate roles={['admin']} title="系统管理中心" description="该区域涉及账号、数据导入和图谱发布，仅管理员可访问。">
      <AdminWorkspace />
    </AuthGate>
  )
}

function AdminWorkspace() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [imports, setImports] = useState<ImportBatch[]>([])
  const [catalogImports, setCatalogImports] = useState<CatalogImport[]>([])
  const [discoveryRuns, setDiscoveryRuns] = useState<DiscoveryRun[]>([])
  const [approved, setApproved] = useState<ReviewProposal[]>([])
  const [graphVersions, setGraphVersions] = useState<GraphVersion[]>([])
  const [dependencies, setDependencies] = useState<Record<string, { status?: string; [key: string]: unknown } | string>>({})
  const [versions, setVersions] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('applicant')
  const [password, setPassword] = useState('')
  const [sourceCode, setSourceCode] = useState('boss')
  const [collectedAt, setCollectedAt] = useState(new Date().toISOString().slice(0, 10))
  const [marketFiles, setMarketFiles] = useState<UploadFile[]>([])
  const [catalogFiles, setCatalogFiles] = useState<UploadFile[]>([])
  const [catalogType, setCatalogType] = useState<'capability' | 'job_role'>('capability')
  const [selectedBatches, setSelectedBatches] = useState<string[]>([])
  const [processingRuns, setProcessingRuns] = useState<ProcessingRunResponse[]>([])
  const [processingErrors, setProcessingErrors] = useState<ProcessingError[]>([])
  const [selectedRun, setSelectedRun] = useState<ProcessingRunResponse | null>(null)
  const [domains, setDomains] = useState<CatalogDomain[]>([])
  const [capabilities, setCapabilities] = useState<CatalogCapability[]>([])
  const [jobRoles, setJobRoles] = useState<CatalogJobRole[]>([])
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importWarnings, setImportWarnings] = useState<ImportWarnings | null>(null)
  const [inspectedImport, setInspectedImport] = useState<ImportBatch | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [userPage, batchItems, catalogItems, runItems, proposalItems, graphItems, dependencyData, versionData, taskItems, domainItems, capabilityItems, roleItems] = await Promise.all([
        listAdminUsers({ page_size: 100 }),
        listImports(),
        listCatalogImports(),
        listDiscoveryRuns(),
        listReviewProposals('approved'),
        listGraphVersions(),
        getSystemDependencies(),
        getSystemVersions(),
        listProcessingRuns(),
        listCatalogDomains(),
        listCatalogCapabilities(true),
        listCatalogJobRoles(true),
      ])
      setUsers(userPage.items)
      setImports(batchItems)
      setCatalogImports(catalogItems)
      setDiscoveryRuns(runItems)
      setApproved(proposalItems)
      setGraphVersions(graphItems)
      setDependencies(dependencyData)
      setVersions(versionData)
      setProcessingRuns(taskItems)
      setDomains(domainItems)
      setCapabilities(capabilityItems)
      setJobRoles(roleItems)
    } catch (value) {
      setError(message(value))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(success)
      await refresh()
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const addUser = async () => {
    if (!username.trim() || !displayName.trim() || password.length < 8) return
    await run(
      () => createAdminUser({ username: username.trim(), display_name: displayName.trim(), role, initial_password: password }),
      '账号已创建。',
    )
    setUsername(''); setDisplayName(''); setPassword('')
  }

  const resetPassword = async (user: AdminUser) => {
    const nextPassword = window.prompt(`为 ${user.username} 设置新密码（至少 8 位）`)
    if (!nextPassword || nextPassword.length < 8) return
    await run(() => resetAdminPassword(user.id, nextPassword), '密码已重置，用户现有会话将失效。')
  }

  const submitMarketImport = async () => {
    const file = marketFiles[0]?.originFileObj as File | undefined
    if (!file || !sourceCode.trim() || !collectedAt) return
    await run(() => uploadImport(file, sourceCode.trim(), new Date(`${collectedAt}T00:00:00+08:00`).toISOString()), '市场 JD 已提交后台处理。')
    setMarketFiles([])
  }

  const submitCatalog = async () => {
    const file = catalogFiles[0]?.originFileObj as File | undefined
    if (!file) return
    await run(() => uploadCatalog(file, catalogType), 'Catalog 文件已导入。')
    setCatalogFiles([])
  }

  const createAndPublish = async (proposalId: string) => {
    setWorking(true)
    setError(null)
    try {
      const graph = await createGraphVersion(proposalId)
      setNotice(`Graph Version v${graph.version_no} 已创建；请复核后在版本列表中发布。`)
      await refresh()
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const inspectRun = async (task: ProcessingRunResponse) => {
    setSelectedRun(task)
    setWorking(true)
    setError(null)
    try { setProcessingErrors(await listProcessingErrors(task.id)) }
    catch (value) { setError(message(value)) }
    finally { setWorking(false) }
  }

  const inspectImport = async (batch: ImportBatch) => {
    setInspectedImport(batch)
    setWorking(true)
    setError(null)
    try {
      const [rows, warnings] = await Promise.all([listImportRows(batch.id), getImportWarnings(batch.id)])
      setImportRows(rows)
      setImportWarnings(warnings)
    } catch (value) {
      setError(message(value))
    } finally {
      setWorking(false)
    }
  }

  const dependencyRows = useMemo(() => Object.entries(dependencies).map(([name, value]) => ({
    name,
    status: typeof value === 'string' ? value : value.status || 'unknown',
    detail: typeof value === 'string' ? '' : JSON.stringify(value),
  })), [dependencies])

  return (
    <main className="workspace-page"><div className="workspace-wrap">
      <header className="workspace-header">
        <div className="workspace-header__icon"><ControlOutlined /></div>
        <div><h1>系统管理中心</h1><p>管理账号与数据管道，显式完成“导入、发现、审核、版本、发布”治理链。</p></div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>刷新全部</Button>
      </header>
      {(error || notice) && <Alert className="workspace-alert" type={error ? 'error' : 'success'} showIcon closable message={error || notice} onClose={() => { setError(null); setNotice(null) }} />}
      <Tabs className="admin-tabs" items={[
        { key: 'system', label: '系统状态', children: <section className="admin-section">
          <div className="section-title"><div><h2>依赖与发布水位</h2><p>必需依赖 down 时后端 Ready 会返回 503；算法与 LLM 允许降级。</p></div></div>
          <div className="dependency-grid">{dependencyRows.map((row) => <div key={row.name}><DatabaseOutlined /><strong>{row.name}</strong><Tag color={row.status === 'ok' ? 'green' : row.status === 'degraded' ? 'gold' : 'red'}>{row.status}</Tag><small>{row.detail}</small></div>)}</div>
          <div className="version-dump">{Object.entries(versions).map(([key, value]) => <div key={key}><span>{key}</span><code>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</code></div>)}</div>
        </section> },
        { key: 'users', label: `账号管理 (${users.length})`, children: <section className="admin-section">
          <div className="section-title"><div><h2>内部账号</h2><p>系统不提供公开注册；管理员创建三类内部账号并维护状态。</p></div></div>
          <div className="inline-create-form"><Input value={username} maxLength={64} placeholder="用户名" onChange={(event) => setUsername(event.target.value)} /><Input value={displayName} maxLength={100} placeholder="显示名称" onChange={(event) => setDisplayName(event.target.value)} /><Select value={role} onChange={setRole} options={[{ value: 'applicant', label: '应聘者' }, { value: 'hr', label: 'HR' }, { value: 'admin', label: '管理员' }]} /><Input.Password value={password} maxLength={128} placeholder="初始密码（至少 8 位）" onChange={(event) => setPassword(event.target.value)} /><Button type="primary" icon={<UserAddOutlined />} loading={working} disabled={!username.trim() || !displayName.trim() || password.length < 8} onClick={() => void addUser()}>创建账号</Button></div>
          <Table rowKey="id" dataSource={users} pagination={{ pageSize: 20 }} columns={[
            { title: '用户', render: (_value, user) => <div><Input size="small" defaultValue={user.display_name} aria-label={`修改 ${user.username} 的显示名称`} onBlur={(event) => { const display_name = event.target.value.trim(); if (display_name && display_name !== user.display_name) void run(() => updateAdminUser(user.id, { display_name }), '显示名称已更新。') }} /><small className="table-subtext">@{user.username}</small></div> },
            { title: '角色', dataIndex: 'role', render: (value: UserRole, user) => <Select size="small" value={value} options={[{ value: 'applicant', label: '应聘者' }, { value: 'hr', label: 'HR' }, { value: 'admin', label: '管理员' }]} onChange={(nextRole: UserRole) => void run(() => updateAdminUser(user.id, { role: nextRole }), '账号角色已更新。')} /> },
            { title: '状态', render: (_value, user) => <Switch checked={user.is_active} checkedChildren="启用" unCheckedChildren="停用" onChange={(is_active) => void run(() => updateAdminUser(user.id, { is_active }), '账号状态已更新。')} /> },
            { title: '最后登录', dataIndex: 'last_login_at', render: formatDate },
            { title: '操作', render: (_value, user) => <Button size="small" onClick={() => void resetPassword(user)}>重置密码</Button> },
          ]} />
        </section> },
        { key: 'market', label: '市场 JD 与发现', children: <section className="admin-section">
          <div className="section-title"><div><h2>市场 JD 导入</h2><p>上传来源文件形成 Raw/Normalized 双层数据，再显式选择批次运行候选发现。</p></div></div>
          <div className="inline-create-form"><Input value={sourceCode} maxLength={50} placeholder="来源代码，如 boss" onChange={(event) => setSourceCode(event.target.value)} /><Input type="date" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} /><Upload maxCount={1} fileList={marketFiles} beforeUpload={() => false} onChange={({ fileList }) => setMarketFiles(fileList.slice(-1))}><Button icon={<CloudUploadOutlined />}>选择 JD 文件</Button></Upload><Button type="primary" loading={working} disabled={!marketFiles.length} onClick={() => void submitMarketImport()}>提交导入</Button></div>
          <Table rowKey="id" rowSelection={{ selectedRowKeys: selectedBatches, onChange: (keys) => setSelectedBatches(keys.map(String)) }} dataSource={imports} pagination={false} columns={[
            { title: '来源', dataIndex: 'source_code' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
            { title: '有效 / 总计', render: (_value, row) => `${row.accepted_rows ?? 0} / ${row.total_rows ?? 0}` },
            { title: '创建时间', dataIndex: 'created_at', render: formatDate },
            { title: '操作', render: (_value, row) => <div className="table-actions"><Button size="small" icon={<FileSearchOutlined />} onClick={() => void inspectImport(row)}>质量详情</Button><Button size="small" onClick={() => void run(() => reprocessImport(row.id), '已创建重新处理任务。')}>重新处理</Button><Button size="small" danger onClick={() => void run(() => archiveImport(row.id), '导入批次已归档。')}>归档</Button></div> },
          ]} />
          <div className="admin-action-bar"><span>已选择 {selectedBatches.length} 个批次</span><Button type="primary" icon={<DeploymentUnitOutlined />} disabled={!selectedBatches.length} loading={working} onClick={() => void run(() => createDiscoveryRun(selectedBatches), 'Discovery Run 已启动。')}>启动候选发现</Button></div>
          <div className="run-list">{discoveryRuns.map((item) => <div key={item.id}><strong>{item.algorithm_version ? String(item.algorithm_version) : 'discovery'}</strong><Tag>{item.status}</Tag><span>{formatDate(item.created_at)}</span></div>)}</div>
        </section> },
        { key: 'tasks', label: `处理任务 (${processingRuns.length})`, children: <section className="admin-section">
          <div className="section-title"><div><h2>后台处理任务</h2><p>集中查看导入、简历、JD 与发现任务；失败任务可重试，进行中的任务可请求取消。</p></div></div>
          <Table rowKey="id" dataSource={processingRuns} pagination={{ pageSize: 20 }} scroll={{ x: 900 }} columns={[
            { title: '任务类型', dataIndex: 'run_type', render: (value: string, row) => <div><strong>{value}</strong><small className="table-subtext">{row.subject_type} / {row.subject_id.slice(0, 8)}</small></div> },
            { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'completed' ? 'green' : ['failed', 'enqueue_failed', 'cancelled'].includes(value) ? 'red' : 'gold'}>{value}</Tag> },
            { title: '阶段', dataIndex: 'current_stage', render: (value: string | null) => value || '等待' },
            { title: '进度', render: (_value, row) => <Progress percent={Math.round(row.progress_percent)} size="small" status={row.status === 'failed' ? 'exception' : row.status === 'completed' ? 'success' : 'active'} /> },
            { title: '创建时间', dataIndex: 'created_at', render: formatDate },
            { title: '操作', render: (_value, row) => <div className="table-actions"><Button size="small" icon={<WarningOutlined />} onClick={() => void inspectRun(row)}>错误</Button>{['failed', 'cancelled', 'enqueue_failed'].includes(row.status) && <Button size="small" onClick={() => void run(() => retryProcessingRun(row.id), '重试任务已创建。')}>重试</Button>}{['pending', 'running'].includes(row.status) && <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => void run(() => cancelProcessingRun(row.id), '已提交取消请求。')}>取消</Button>}</div> },
          ]} />
        </section> },
        { key: 'catalog', label: '能力与岗位目录', children: <section className="admin-section">
          <div className="section-title"><div><h2>Catalog 导入</h2><p>Capability 与 JobRole 分开导入；33 项能力模型应先以 Catalog 数据进入后端，再参与精确映射。</p></div></div>
          <div className="inline-create-form"><Select value={catalogType} onChange={setCatalogType} options={[{ value: 'capability', label: 'Capability' }, { value: 'job_role', label: 'JobRole' }]} /><Upload maxCount={1} fileList={catalogFiles} beforeUpload={() => false} onChange={({ fileList }) => setCatalogFiles(fileList.slice(-1))}><Button icon={<CloudUploadOutlined />}>选择目录文件</Button></Upload><Button type="primary" loading={working} disabled={!catalogFiles.length} onClick={() => void submitCatalog()}>导入 Catalog</Button></div>
          <Table rowKey="id" dataSource={catalogImports} pagination={false} columns={[{ title: '类型', dataIndex: 'import_type' }, { title: 'Schema', dataIndex: 'schema_version' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> }, { title: '时间', dataIndex: 'created_at', render: formatDate }]} />
          <div className="catalog-metrics"><span><strong>{domains.length}</strong>技术域</span><span><strong>{capabilities.length}</strong>能力</span><span><strong>{jobRoles.length}</strong>岗位</span></div>
          <Tabs size="small" items={[
            { key: 'domains', label: '技术域', children: <div className="capability-chip-list">{domains.map((item) => <span key={item.id}>{item.code} · {item.name}</span>)}</div> },
            { key: 'capabilities', label: '能力目录', children: <Table size="small" rowKey="id" dataSource={capabilities} pagination={{ pageSize: 15 }} columns={[{ title: '能力', dataIndex: 'canonical_name' }, { title: '技术域', dataIndex: 'domain_name' }, { title: '类型', dataIndex: 'skill_type', render: (value: string) => <Tag>{value}</Tag> }, { title: '状态', dataIndex: 'status' }]} /> },
            { key: 'roles', label: '岗位目录', children: <Table size="small" rowKey="id" dataSource={jobRoles} pagination={{ pageSize: 15 }} columns={[{ title: '岗位', dataIndex: 'canonical_name' }, { title: '技术域', dataIndex: 'domain_name' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> }, { title: '来源', dataIndex: 'source_type' }]} /> },
          ]} />
        </section> },
        { key: 'publish', label: '图谱发布', children: <section className="admin-section">
          <div className="section-title"><div><h2>批准提案与 Graph Version</h2><p>先创建草稿版本并复核，再单独发布；前端不会把两个治理动作自动合并。</p></div></div>
          <div className="publish-grid"><div><h3>已批准提案</h3>{approved.map((proposal) => <div className="publish-row" key={proposal.id}><div><strong>{proposal.proposed_payload.role_name}</strong><span>{formatDate(proposal.created_at)}</span></div><Button icon={<PlusOutlined />} loading={working} onClick={() => void createAndPublish(proposal.id)}>创建版本</Button></div>)}{!approved.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已批准提案" />}</div><div><h3>Graph Version</h3>{graphVersions.map((version) => <div className="publish-row" key={version.id}><div><strong>v{version.version_no}</strong><span>{version.status} · {formatDate(version.created_at)}</span></div>{version.status !== 'published' && <Button type="primary" icon={<SafetyCertificateOutlined />} loading={working} onClick={() => void run(() => publishGraphVersion(version.id), `Graph Version v${version.version_no} 已发布。`)}>发布</Button>}</div>)}{!graphVersions.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无图谱版本" />}</div></div>
        </section> },
      ]} />
      <Modal width={820} open={Boolean(selectedRun)} title={selectedRun ? `任务错误 / ${selectedRun.run_type}` : '任务错误'} footer={null} onCancel={() => { setSelectedRun(null); setProcessingErrors([]) }}>
        {selectedRun && <div className="task-inspector"><div className="catalog-metrics"><span><strong>{Math.round(selectedRun.progress_percent)}%</strong>进度</span><span><strong>{selectedRun.failed_count}</strong>失败项</span><span><strong>{selectedRun.attempt_count}/{selectedRun.max_attempts}</strong>尝试</span></div>{selectedRun.error_message && <Alert type="error" showIcon message={selectedRun.error_message} />}{processingErrors.length ? <Table size="small" rowKey="id" dataSource={processingErrors} pagination={{ pageSize: 10 }} columns={[{ title: '阶段', dataIndex: 'stage' }, { title: '错误码', dataIndex: 'error_code' }, { title: '说明', dataIndex: 'message' }, { title: '可重试', dataIndex: 'retryable', render: (value: boolean) => value ? '是' : '否' }, { title: '时间', dataIndex: 'occurred_at', render: formatDate }]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该任务没有逐项错误记录" />}</div>}
      </Modal>
      <Modal width={900} open={Boolean(inspectedImport)} title={inspectedImport ? `导入质量 / ${inspectedImport.source_code}` : '导入质量'} footer={null} onCancel={() => { setInspectedImport(null); setImportRows([]); setImportWarnings(null) }}>
        <div className="import-inspector">
          <div className="capability-chip-list">{Object.entries(importWarnings?.summary || {}).map(([code, count]) => <span key={code}>{code} · {count}</span>)}{!Object.keys(importWarnings?.summary || {}).length && <span>未发现质量警告</span>}</div>
          <Table size="small" rowKey={(row) => row.raw.id} dataSource={importRows} pagination={{ pageSize: 10 }} scroll={{ x: 720 }} columns={[{ title: '行', render: (_value, row) => row.raw.row_number }, { title: '原始岗位', render: (_value, row) => <div><strong>{row.raw.job_name || '未命名'}</strong><small className="table-subtext">{row.raw.company_name || '未知公司'} · {row.raw.city_text || '未知地区'}</small></div> }, { title: '标准岗位', render: (_value, row) => row.normalized?.normalized_title || '未标准化' }, { title: '质量分', render: (_value, row) => row.normalized ? Math.round(row.normalized.quality_score) : '-' }, { title: '警告', render: (_value, row) => [...row.raw.parse_warnings, ...(row.normalized?.quality_flags || [])].join(', ') || '无' }]} />
        </div>
      </Modal>
    </div></main>
  )
}
