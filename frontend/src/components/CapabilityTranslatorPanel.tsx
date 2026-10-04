import { Collapse, Tag, Tooltip } from 'antd'
import { BookOutlined, ExperimentOutlined, InfoCircleOutlined, ToolOutlined } from '@ant-design/icons'
import type { ResumeSkillRecord } from '../services/resumeWorkflowApi'
import {
  BARS_LEVELS,
  CAPABILITIES,
  DIMENSION_LABELS,
  JOB_FAMILIES,
  TRANSLATION_WEIGHTS,
  inferMajorPrior,
  mapToFrameworkCapability,
} from '../data/capabilityFramework'

interface CapabilityTranslatorPanelProps {
  skills: ResumeSkillRecord[]
  major?: string | null
}

const proficiencyToBars: Record<string, number> = { beginner: 2, intermediate: 3, advanced: 4 }

export default function CapabilityTranslatorPanel({ skills, major }: CapabilityTranslatorPanelProps) {
  const mapped = skills.map((skill) => ({ skill, definition: mapToFrameworkCapability(skill.capability_name || skill.raw_name) }))
  const frameworkMatches = mapped.filter((item) => item.definition)
  const prior = inferMajorPrior(major)
  const grouped = CAPABILITIES.reduce<Record<string, typeof CAPABILITIES>>((result, item) => {
    ;(result[item.group] ??= []).push(item)
    return result
  }, {})

  return (
    <section className="capability-model" aria-labelledby="capability-model-title">
      <div className="capability-model__heading">
        <div>
          <h3 id="capability-model-title">能力翻译视图</h3>
          <p>将后端的技能证据对齐到 33 项能力白名单，硬技能看缺口，软技能看迁移价值。</p>
        </div>
        <Tooltip title="本视图是基于所提供文献的前端解释层，不改写后端匹配分。">
          <InfoCircleOutlined aria-label="说明" />
        </Tooltip>
      </div>

      <div className="translation-weight-row" aria-label="翻译维度权重">
        {TRANSLATION_WEIGHTS.map((weight) => (
          <div key={weight.label} className="translation-weight">
            <strong>{weight.value}%</strong>
            <span>{weight.label}</span>
            <small>{weight.note}</small>
          </div>
        ))}
        <div className="translation-weight translation-weight--gap">
          <strong>9 项</strong>
          <span>硬技能缺口</span>
          <small>单独用于补课与微证书，不混入 45/40/15</small>
        </div>
      </div>

      {prior && (
        <div className="major-translation">
          <BookOutlined />
          <div>
            <strong>{major} · {prior.category}文献先验</strong>
            <p>可迁移优势：{prior.strengths.join('、')}</p>
            <p>优先探索：{prior.families.map((id) => JOB_FAMILIES[id].name).join('、')}</p>
          </div>
          <Tag color="gold">需简历证据校准</Tag>
        </div>
      )}

      <div className="dual-track-grid">
        <div className="dual-track-pane">
          <div className="dual-track-pane__title"><ToolOutlined /><strong>硬技能缺口</strong><span>9 项工具操作</span></div>
          <p>不用于否定原专业价值，只用于明确下一步要补的技能。</p>
          <div className="capability-chip-list">
            {CAPABILITIES.filter((item) => item.track === 'gap').map((item) => <span key={item.name}>{item.name}</span>)}
          </div>
        </div>
        <div className="dual-track-pane">
          <div className="dual-track-pane__title"><ExperimentOutlined /><strong>软技能翻译</strong><span>24 项可迁移能力</span></div>
          <p>通用能力、知识、认知、工作风格和心理资本一并翻译给岗位侧。</p>
          <div className="capability-chip-list">
            {Object.entries(DIMENSION_LABELS).filter(([key]) => key !== 'hard_skill').map(([key, label]) => (
              <span key={key}>{label} {CAPABILITIES.filter((item) => item.dimension === key).length}</span>
            ))}
          </div>
        </div>
      </div>

      {frameworkMatches.length > 0 ? (
        <div className="evidence-mapping">
          <h4>当前简历中的能力证据</h4>
          {frameworkMatches.map(({ skill, definition }) => {
            if (!definition) return null
            const barsLevel = skill.proficiency ? proficiencyToBars[skill.proficiency] : undefined
            const bars = barsLevel ? BARS_LEVELS[barsLevel - 1] : null
            return (
              <div className="evidence-mapping__row" key={skill.id}>
                <div>
                  <strong>{definition.name}</strong>
                  <span>{DIMENSION_LABELS[definition.dimension]} · {definition.track === 'gap' ? '缺口轨' : '翻译轨'} · {JOB_FAMILIES[definition.primary].name}</span>
                </div>
                <div className="evidence-mapping__bars">
                  <span>{bars ? `BARS ${bars.level} · ${bars.label}` : '待人工定级'}</span>
                  <small>{skill.evidence_quote || '暂无可引用证据'}</small>
                </div>
              </div>
            )
          })}
          <p className="capability-model__note">BARS 等级由后端 beginner/intermediate/advanced 做 2/3/4 级界面换算；最终等级应以可观察行为和人工审核为准。</p>
        </div>
      ) : (
        <div className="capability-empty">当前技能名称尚未命中 33 项能力或文档别名，请在画像确认时人工校对。</div>
      )}

      <Collapse
        ghost
        items={Object.entries(grouped).map(([group, items]) => ({
          key: group,
          label: `${group} · ${items?.length ?? 0} 项`,
          children: <div className="capability-definition-grid">{items?.map((item) => <span key={item.name}>{item.name}<small>{JOB_FAMILIES[item.primary].name}</small></span>)}</div>,
        }))}
      />
    </section>
  )
}
