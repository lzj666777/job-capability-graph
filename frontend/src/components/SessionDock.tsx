import { Button, Dropdown, type MenuProps } from 'antd'
import {
  AuditOutlined, ControlOutlined, FileSearchOutlined, LogoutOutlined,
  MenuOutlined, RiseOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SessionDock() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const items: MenuProps['items'] = [
    { key: '/applicant', icon: <FileSearchOutlined />, label: '应聘者评估' },
    { key: '/hr', icon: <TeamOutlined />, label: 'HR 工作台' },
    { key: '/emerging', icon: <RiseOutlined />, label: '新兴岗位发现' },
    { key: '/review', icon: <AuditOutlined />, label: '岗位审核中心' },
    { key: '/admin', icon: <ControlOutlined />, label: '系统管理中心' },
    ...(user ? [
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: `退出 ${user.display_name}` },
    ] : []),
  ]
  const handleClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') void logout().then(() => navigate('/'))
    else navigate(key)
  }
  return (
    <Dropdown menu={{ items, onClick: handleClick }} placement="bottomRight" trigger={['click']}>
      <Button className="session-dock" icon={<MenuOutlined />} aria-label="打开功能与账号菜单">
        {user ? user.display_name : '工作台'}
      </Button>
    </Dropdown>
  )
}
