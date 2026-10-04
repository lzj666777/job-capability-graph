export type DualTrack = 'gap' | 'translate'
export type MetaDimension = 'hard_skill' | 'general_competency' | 'knowledge' | 'cognitive_ability' | 'work_style' | 'psycap'
export type JobFamilyId = 'J1' | 'J2' | 'J3' | 'J4'

export interface CapabilityDefinition {
  name: string
  track: DualTrack
  dimension: MetaDimension
  group: string
  primary: JobFamilyId
  secondary?: JobFamilyId
}

export const JOB_FAMILIES: Record<JobFamilyId, { name: string; description: string }> = {
  J1: { name: 'J1 数字内容/人文', description: '内容运营、AIGC 内容审核、文案策略与数字人文' },
  J2: { name: 'J2 数据/分析', description: '商业数据分析、文本挖掘、数字化解决方案' },
  J3: { name: 'J3 产品/管理', description: '产品、运营、项目管理与行业解决方案' },
  J4: { name: 'J4 交叉研究', description: '交叉研究、AI 伦理合规、生成式 AI 系统应用' },
}

const hard = (name: string, primary: JobFamilyId, secondary?: JobFamilyId): CapabilityDefinition => ({ name, track: 'gap', dimension: 'hard_skill', group: '工具操作', primary, secondary })
const soft = (name: string, dimension: MetaDimension, group: string, primary: JobFamilyId, secondary?: JobFamilyId): CapabilityDefinition => ({ name, track: 'translate', dimension, group, primary, secondary })

export const CAPABILITIES: CapabilityDefinition[] = [
  hard('数据清洗', 'J2'), hard('统计推断', 'J2'), hard('数据可视化', 'J2'), hard('文本挖掘', 'J2', 'J4'), hard('提示工程', 'J2', 'J1'), hard('AI 内容生成', 'J1'), hard('图文编辑', 'J1'), hard('短视频制作', 'J1'), hard('交互内容制作', 'J1'),
  soft('数学建模', 'general_competency', '创新研发', 'J2'), soft('创新策划', 'general_competency', '创新研发', 'J4', 'J2'), soft('跨界迁移', 'general_competency', '创新研发', 'J4', 'J3'),
  soft('跨部门沟通', 'general_competency', '组织协调', 'J3'), soft('团队协作', 'general_competency', '组织协调', 'J3'), soft('冲突解决', 'general_competency', '组织协调', 'J3'), soft('任务拆解', 'general_competency', '组织协调', 'J3'), soft('进度管理', 'general_competency', '组织协调', 'J3'), soft('资源协调', 'general_competency', '组织协调', 'J3'), soft('独立交付', 'general_competency', '组织协调', 'J3', 'J4'),
  soft('文本解读', 'general_competency', '表达与写作', 'J1'), soft('写作能力', 'general_competency', '表达与写作', 'J1', 'J4'), soft('培养他人', 'general_competency', '表达与写作', 'J3', 'J2'),
  soft('商业思维', 'knowledge', '知识基础', 'J3', 'J2'), soft('行业趋势研判', 'knowledge', '知识基础', 'J3', 'J2'), soft('文献检索', 'knowledge', '知识基础', 'J4'),
  soft('批判性思维', 'cognitive_ability', '认知能力', 'J4', 'J3'), soft('逻辑思维', 'cognitive_ability', '认知能力', 'J4', 'J2'),
  soft('持续改进', 'work_style', '工作风格', 'J4', 'J2'), soft('质量意识', 'work_style', '工作风格', 'J2', 'J1'), soft('成果导向', 'work_style', '工作风格', 'J3', 'J2'), soft('责任担当', 'work_style', '工作风格', 'J3', 'J4'),
  soft('快速学习', 'psycap', '心理资本', 'J2', 'J4'), soft('抗压韧性', 'psycap', '心理资本', 'J2', 'J3'),
]

export const DIMENSION_LABELS: Record<MetaDimension, string> = {
  hard_skill: '硬技能', general_competency: '通用能力', knowledge: '知识基础', cognitive_ability: '认知能力', work_style: '工作风格', psycap: '心理资本',
}

export const BARS_LEVELS = [
  { level: 1, label: '了解', description: '知道概念与基本方法' },
  { level: 2, label: '理解', description: '能说明逻辑与适用场景' },
  { level: 3, label: '独立应用', description: '能独立完成一项可观察任务' },
  { level: 4, label: '熟练', description: '能在复杂场景中优化并交付' },
  { level: 5, label: '可指导他人', description: '能沉淀规范、方法并带教' },
]

export const TRANSLATION_WEIGHTS = [
  { label: '综合素质', value: 45, note: '软技能、认知、工作风格与心理资本' },
  { label: '知识基础', value: 40, note: '原专业知识与跨学科迁移' },
  { label: '学历层次', value: 15, note: '学习能力代理，不作硬技能' },
]

export const MAJOR_PRIORS = [
  { category: '文史哲', test: /历史|汉语言|中文|文学|哲学|社会学/, strengths: ['文本解读', '写作能力', '批判性思维', '文献检索'], families: ['J1', 'J4'] as JobFamilyId[] },
  { category: '数理化', test: /数学|统计|物理|化学|理学/, strengths: ['数学建模', '统计推断', '逻辑思维', '批判性思维'], families: ['J2', 'J4'] as JobFamilyId[] },
  { category: '传统经管工科', test: /会计|经济|金融|管理|机械|土木|工程/, strengths: ['商业思维', '统计推断', '任务拆解', '跨部门沟通'], families: ['J3', 'J2'] as JobFamilyId[] },
]

const aliases: Array<[RegExp, string]> = [
  [/Python|pandas|SQL|数据爬取|数据标注/i, '数据清洗'], [/SPSS|统计分析|回归|方差分析/i, '统计推断'], [/可视化|看板|图表|PPT/i, '数据可视化'], [/NLP|RAG|OCR|文本挖掘|知识库/i, '文本挖掘'], [/ChatGPT|DeepSeek|Prompt|提示词|Agent/i, '提示工程'], [/ComfyUI|Dify|工作流搭建|数字人/i, 'AI 内容生成'], [/Midjourney|Stable Diffusion|Photoshop|PS|海报|封面图/i, '图文编辑'], [/剪映|Premiere|达芬奇|短视频|图生视频/i, '短视频制作'], [/报告|文案|文档撰写|学术写作/i, '写作能力'], [/团队|组长|协作|分工/i, '团队协作'], [/独立完成|全流程|从\s*0\s*到\s*1/i, '独立交付'], [/迭代|优化|提效|效率提升/i, '持续改进'], [/准确率|质量|细致严谨|排查/i, '质量意识'], [/转化率|提升\s*\d+%|排名|点击率|满意度/i, '成果导向'],
]

export function mapToFrameworkCapability(value: string) {
  const exact = CAPABILITIES.find((item) => item.name === value.replace(/内容生成/, 'AI 内容生成'))
  if (exact) return exact
  const alias = aliases.find(([pattern]) => pattern.test(value))
  return alias ? CAPABILITIES.find((item) => item.name === alias[1]) ?? null : null
}

export function inferMajorPrior(major?: string | null) {
  if (!major) return null
  return MAJOR_PRIORS.find((item) => item.test.test(major)) ?? null
}
