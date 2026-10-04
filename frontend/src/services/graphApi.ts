import type { GraphData, Planet, Star } from '../types/graph'
import request from '../utils/request'

interface PublishedGraphNode {
  id: string
  type: 'domain' | 'job_role' | 'capability'
  name: string
  properties: Record<string, unknown>
}

interface PublishedGraphEdge {
  id: string
  type: 'belongs_to' | 'requires' | 'bonus'
  source: string
  target: string
  properties: Record<string, unknown>
}

interface PublishedGraphResponse {
  graph_version: { id: string; version_no: number; published_at: string }
  nodes: PublishedGraphNode[]
  edges: PublishedGraphEdge[]
  truncated: boolean
}

interface EmergingGraphCandidate {
  id: string
  suggested_name: string
  support_job_count: number
  source_count: number
  company_count: number
  overall_candidate_score: number
  required_skill_names?: string[]
  bonus_skill_names?: string[]
  industries?: string[]
  status: string
  source?: string
}


/**
 * 获取知识图谱数据
 */
export async function fetchGraphData(params?: {
  category?: string
  level?: string
}): Promise<GraphData> {
  const [graphResult, emergingResult] = await Promise.allSettled([
    request.get<PublishedGraphResponse>('/api/v1/graph', {
      params: params?.category ? { domain_id: params.category } : undefined,
    }),
    fetchEmergingCandidates(),
  ])
  if (graphResult.status === 'rejected') {
    throw graphResult.reason
  }

  const graph = graphResult.value
  const emerging = emergingResult.status === 'fulfilled' ? emergingResult.value : []
  if (emergingResult.status === 'rejected') {
    console.warn('Failed to load emerging jobs for graph:', emergingResult.reason)
  }
  return convertPublishedGraphData(graph, emerging)
}

async function fetchEmergingCandidates(): Promise<EmergingGraphCandidate[]> {
  const values: EmergingGraphCandidate[] = []
  for (let page = 1; page <= 10; page += 1) {
    const chunk = await request.get<EmergingGraphCandidate[]>('/api/v1/graph/emerging-jobs', {
      params: { page, page_size: 100 },
    })
    values.push(...chunk)
    if (chunk.length < 100) break
  }
  return values
}

function convertPublishedGraphData(
  apiData: PublishedGraphResponse,
  emergingCandidates: EmergingGraphCandidate[] = [],
): GraphData {
  const domains = new Map(apiData.nodes.filter((node) => node.type === 'domain').map((node) => [node.id, node]))
  const roles = apiData.nodes.filter((node) => node.type === 'job_role')
  const capabilities = new Map(apiData.nodes.filter((node) => node.type === 'capability').map((node) => [node.id, node]))
  const roleDomain = new Map(
    apiData.edges
      .filter((edge) => edge.type === 'belongs_to' && roles.some((role) => role.id === edge.source))
      .map((edge) => [edge.source, domains.get(edge.target)?.name || '未分类岗位']),
  )
  const requirementEdges = apiData.edges.filter((edge) => edge.type === 'requires' || edge.type === 'bonus')

  const stars = roles.map((role, index) => {
    const edges = requirementEdges.filter((edge) => edge.source === role.id)
    const requiredSkills = edges
      .filter((edge) => edge.type === 'requires')
      .map((edge) => capabilities.get(edge.target)?.name)
      .filter((name): name is string => Boolean(name))
    const bonusSkills = edges
      .filter((edge) => edge.type === 'bonus')
      .map((edge) => capabilities.get(edge.target)?.name)
      .filter((name): name is string => Boolean(name))

    return {
      id: role.id,
      label: role.name,
      name: role.name,
      domain: roleDomain.get(role.id) || '未分类岗位',
      color: getJobColor(index),
      position: normalizePosition(undefined, index),
      size: normalizeStarSize(0.82 + edges.length * 0.045),
      requiredSkills,
      bonusSkills,
      sources: edges.length,
      jobCount: 1,
      isEmerging: false,
    }
  })

  const planets = requirementEdges.flatMap((edge, index) => {
    const capability = capabilities.get(edge.target)
    if (!capability || !roles.some((role) => role.id === edge.source)) return []
    const isRequired = edge.type === 'requires'
    const skillType = typeof capability.properties.skill_type === 'string' ? capability.properties.skill_type : 'soft'
    const type = !isRequired ? 'frontier' : skillType === 'hard' ? 'core' : 'foundation'
    const importanceValue = Number(edge.properties.importance ?? 0)
    const confidence = importanceValue <= 1 ? importanceValue * 100 : importanceValue * 20

    return [{
      id: edge.id,
      starId: edge.source,
      label: capability.name,
      type: type as 'core' | 'foundation' | 'frontier',
      isRequired,
      orbitRadius: (isRequired ? 2.1 : 4.2) + (index % 7) * 0.42,
      orbitTilt: Math.PI / (isRequired ? 8 : 10),
      orbitPhase: (index % 16) * 0.39,
      orbitSpeed: Math.max(0.05, (isRequired ? 0.24 : 0.13) - (index % 5) * 0.015),
      size: isRequired ? 0.24 : 0.19,
      confidence: Math.max(0, Math.min(100, Math.round(confidence || 60))),
      color: getSkillColor(type === 'core' ? '核心' : type === 'frontier' ? '前沿' : '基础'),
    }]
  })

  const emergingStars: Star[] = []
  const emergingPlanets: Planet[] = []
  emergingCandidates.forEach((candidate, index) => {
    const requiredSkills = [...new Set(candidate.required_skill_names ?? [])].filter(Boolean)
    const bonusSkills = [...new Set(candidate.bonus_skill_names ?? [])].filter(Boolean)
    const allSkills = [...requiredSkills, ...bonusSkills]
    const starId = `emerging:${candidate.id}`
    emergingStars.push({
      id: starId,
      label: candidate.suggested_name,
      name: candidate.suggested_name,
      domain: '新兴岗位数据',
      color: '#ee1212',
      position: normalizePosition(undefined, stars.length + index),
      size: normalizeStarSize(0.9 + Math.min(allSkills.length, 12) * 0.035),
      requiredSkills,
      bonusSkills,
      sources: candidate.source_count || 1,
      jobCount: candidate.support_job_count || 1,
      isEmerging: true,
      sourceCounts: { workbook_definition: candidate.source_count || 1 },
    })
    allSkills.forEach((skill, skillIndex) => {
      const isRequired = skillIndex < requiredSkills.length
      const type = isRequired ? 'core' : 'frontier'
      emergingPlanets.push({
        id: `${starId}:${isRequired ? 'required' : 'bonus'}:${normalizeLabel(skill)}`,
        starId,
        label: skill,
        type,
        isRequired,
        orbitRadius: (isRequired ? 2.1 : 4.2) + (skillIndex % 7) * 0.42,
        orbitTilt: Math.PI / (isRequired ? 8 : 10),
        orbitPhase: (skillIndex % 16) * 0.39,
        orbitSpeed: Math.max(0.05, (isRequired ? 0.24 : 0.13) - (skillIndex % 5) * 0.015),
        size: isRequired ? 0.24 : 0.19,
        confidence: Math.max(0, Math.min(100, Math.round((candidate.overall_candidate_score || 0.6) * 100))),
        color: getSkillColor(type === 'core' ? '核心' : '前沿'),
      })
    })
  })

  const allStars = [...emergingStars, ...stars]
  const allPlanets = [...emergingPlanets, ...planets]
  return {
    stars: allStars,
    planets: allPlanets,
    metadata: {
      total_jobs: allStars.reduce((sum, star) => sum + (star.jobCount ?? 0), 0),
      total_categories: domains.size + (emergingStars.length ? 1 : 0),
      total_skills: new Set(allPlanets.map((planet) => planet.label)).size,
      total_planets: allPlanets.length,
      generated_at: apiData.graph_version.published_at,
      featured_star_ids: allStars.slice(0, 8).map((star) => star.id),
    },
  }
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function normalizePosition(
  position: [number, number, number] | undefined,
  index: number
): [number, number, number] {
  if (position && position.length === 3) {
    return position
  }

  const angle = (index / 24) * Math.PI * 2
  const radius = 6 + (index % 7) * 1.35
  return [
    Math.cos(angle) * radius,
    ((index * 3) % 7) - 3,
    Math.sin(angle) * radius,
  ]
}

function normalizeStarSize(size?: number): number {
  if (!size || Number.isNaN(size)) {
    return 1
  }

  if (size > 5) {
    return Math.max(0.75, Math.min(size / 16, 1.8))
  }

  return Math.max(0.72, Math.min(size, 1.8))
}

/**
 * 获取岗位颜色
 */
function getJobColor(index: number, isNew?: boolean): string {
  if (isNew) {
    return '#ee1212'
  }

  const colors = ['#fff3ea', '#e4b592', '#dad0c8', '#b9aea4', '#ee1212']
  return colors[index % colors.length]
}

/**
 * 获取技能颜色
 */
function getSkillColor(level: string): string {
  const colorMap: Record<string, string> = {
    基础: '#dad0c8',
    核心: '#ee1212',
    前沿: '#e4b592',
  }
  return colorMap[level] || '#ee1212'
}
