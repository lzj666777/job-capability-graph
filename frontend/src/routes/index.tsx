import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import DynamicSkillBackground from '../components/DynamicSkillBackground'
import ArchiveReturnHome from '../components/ArchiveReturnHome'
import SessionDock from '../components/SessionDock'

const SpaceHomePage = lazy(() => import('../pages/SpaceHomePage'))
const SpaceGraphPage = lazy(() => import('../pages/SpaceGraphPage'))
const ApplicantFlowPage = lazy(() => import('../pages/ApplicantFlowPage'))
const HRWorkspacePage = lazy(() => import('../pages/HRWorkspacePage'))
const EmergingJobsPage = lazy(() => import('../pages/EmergingJobsPage'))
const ReviewCenterPage = lazy(() => import('../pages/ReviewCenterPage'))
const AdminCenterPage = lazy(() => import('../pages/AdminCenterPage'))

function RouteFallback() {
  return <div className="route-fallback" aria-label="正在加载页面"><span /><span /><span /></div>
}

const RoutedApp = () => {
  const location = useLocation()
  const isArchiveHome = location.pathname === '/'
  return (
    <div className="app-shell">
      <DynamicSkillBackground />
      {!isArchiveHome && <ArchiveReturnHome />}
      <SessionDock />
      <main className="app-content">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<SpaceHomePage />} />
            <Route path="/graph" element={<SpaceGraphPage />} />
            <Route path="/applicant" element={<ApplicantFlowPage />} />
            <Route path="/resume-match" element={<ApplicantFlowPage />} />
            <Route path="/hr" element={<HRWorkspacePage />} />
            <Route path="/hr-match" element={<HRWorkspacePage />} />
            <Route path="/emerging" element={<EmergingJobsPage />} />
            <Route path="/new-jobs" element={<EmergingJobsPage />} />
            <Route path="/review" element={<ReviewCenterPage />} />
            <Route path="/admin" element={<AdminCenterPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

const AppRouter = () => <BrowserRouter><RoutedApp /></BrowserRouter>
export default AppRouter
