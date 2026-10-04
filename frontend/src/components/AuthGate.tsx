import { useState, type ReactNode } from 'react'
import { Alert, Button, Input } from 'antd'
import { LockOutlined, LoginOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import type { AuthUser } from '../types/api'

type Role = AuthUser['role']

interface AuthGateProps {
  children: ReactNode
  roles?: Role[]
  title: string
  description: string
}

export default function AuthGate({ children, roles, title, description }: AuthGateProps) {
  const { user, loading, sessionError, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    if (!username.trim() || password.length < 8 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await login(username.trim(), password)
    } catch (value) {
      const message = value instanceof Error ? value.message : '登录失败，请检查账号与密码'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="workspace-page workspace-page--center" aria-busy="true">
        <div className="workspace-skeleton" aria-label="正在检查登录状态">
          <span /><span /><span />
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="workspace-page workspace-page--center">
        <section className="auth-panel" aria-labelledby="auth-title">
          <LockOutlined className="auth-panel__icon" />
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
          <div className="auth-panel__form">
            <Input
              size="large"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="用户名"
              autoComplete="username"
              aria-label="用户名"
              onPressEnter={() => void handleLogin()}
            />
            <Input.Password
              size="large"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="密码"
              autoComplete="current-password"
              aria-label="密码"
              onPressEnter={() => void handleLogin()}
            />
            <Button
              type="primary"
              size="large"
              icon={<LoginOutlined />}
              loading={submitting}
              disabled={!username.trim() || password.length < 8}
              onClick={() => void handleLogin()}
            >
              登录并继续
            </Button>
          </div>
          {(error || sessionError) && <Alert type="error" showIcon message={error || sessionError} />}
        </section>
      </main>
    )
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <main className="workspace-page workspace-page--center">
        <section className="auth-panel">
          <LockOutlined className="auth-panel__icon" />
          <h1>当前账号无权访问</h1>
          <p>此工作台需要 {roles.map(roleLabel).join('或')} 角色，当前登录为{roleLabel(user.role)}。</p>
        </section>
      </main>
    )
  }

  return children
}

function roleLabel(role: Role) {
  if (role === 'admin') return '管理员'
  if (role === 'hr') return 'HR'
  return '应聘者'
}
