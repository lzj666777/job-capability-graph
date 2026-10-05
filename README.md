# job-capability-graph

面向新兴岗位的人才能力图谱与智能人岗匹配系统。

项目以统一的能力框架连接市场 JD、岗位定义、个人简历和招聘流程，为求职者提供可解释的岗位匹配与成长建议，也为 HR 提供从岗位需求解析到候选人排序的完整工作台。系统内置新兴岗位数据，并通过 3D 知识图谱展示岗位、能力及其关系。

## 核心功能

- **能力框架**：统一管理硬技能、可迁移能力、能力别名、权重和 BARS 行为锚定等级。
- **简历评估**：解析 PDF/DOCX 简历，生成可人工修订、确认和追溯的能力画像。
- **人岗匹配**：基于已确认画像与岗位能力要求进行确定性评分，展示匹配项和能力缺口。
- **成长路径**：围绕目标岗位的缺失能力生成结构化提升计划。
- **HR 工作台**：管理招聘项目、解析 JD、确认岗位要求、批量处理候选简历并生成排名。
- **新兴岗位发现**：提供 192 个聚合岗位定义，支持证据查看、人工审核和正式发布。
- **3D 知识图谱**：展示岗位、必备能力、加分能力以及新兴岗位数据。
- **管理与审计**：提供多角色账号、任务状态、审核中心、图谱版本和系统诊断。

## 系统角色

| 角色 | 主要能力 |
| --- | --- |
| Applicant | 简历评估、岗位推荐、能力差距与成长路径 |
| HR | 招聘项目、JD 解析、候选人匹配、新兴岗位审核 |
| Admin | 用户管理、数据导入、能力目录、审核发布与系统诊断 |

系统不开放自助注册。首个管理员通过命令行创建，其余账号由管理员在系统内维护。

## 技术架构

- 前端：React、TypeScript、Vite、Ant Design、Three.js
- API：FastAPI、Pydantic、SQLAlchemy、Alembic
- 数据：PostgreSQL 16、pgvector、Neo4j 5
- 异步任务：Redis、Celery
- 部署：Docker Compose

PostgreSQL 保存业务事实、版本和任务状态，Neo4j 保存已审核发布的图谱投影。LLM 只参与受约束的信息抽取与成长建议，最终匹配分数由后端确定性计算。

## 快速启动

### 1. 准备环境

需要安装 Docker Desktop、Node.js 20+ 和 npm。

```bash
git clone https://github.com/lzj666777/job-capability-graph.git
cd job-capability-graph
cp .env.example .env
```

请至少将 `.env` 中的 `SESSION_SECRET` 替换为长度不少于 32 位的随机字符串。简历解析和成长路径需要额外配置兼容 Responses API 的模型服务：

```dotenv
LLM_RESPONSES_URL=https://api.openai.com/v1/responses
LLM_API_KEY=<your-api-key>
LLM_MODEL=<model-name>
```

未配置 LLM 时，账号、能力目录、新兴岗位和知识图谱等功能仍可运行。

### 2. 启动后端

```bash
docker compose up -d postgres redis neo4j
docker compose run --rm migrate

docker compose run --rm api uv run python scripts/create_user.py \
  --username admin \
  --display-name 系统管理员 \
  --role admin

docker compose run --rm api uv run python scripts/bootstrap_capability_framework.py
docker compose run --rm api uv run python scripts/import_emerging_job_definitions.py \
  data/emerging_job_definitions.json

docker compose up -d api worker scheduler
```

创建管理员时，终端会提示输入并确认密码，密码不会回显。初始化脚本均支持重复执行，不会重复创建相同目录或岗位数据。

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

启动后可访问：

- 前端：<http://127.0.0.1:5174>
- API 文档：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/health/ready>
- Neo4j Browser：<http://127.0.0.1:7474>

## 内置数据

仓库内提供两类可复现的初始化数据：

- `backend/app/catalog/framework_v1.json`：能力框架、分类、别名、行为锚点和岗位映射基础数据。
- `backend/data/emerging_job_definitions.json`：由岗位工作簿整理出的 192 个聚合岗位定义。

新兴岗位数据只包含岗位级聚合信息，不包含原始 JD 正文、个人简历、联系方式或 API Key。

## 项目结构

```text
backend/                 FastAPI 服务、任务、迁移、脚本与测试
frontend/                React 前端与 3D 知识图谱
backend/data/            可公开的初始化数据
docs/                    研究报告与系统说明
outputs/                 后端架构和数据库设计文档
compose.yaml             本地完整运行环境
```

## 开发验证

后端：

```bash
cd backend
uv sync --group dev
uv run ruff check .
uv run pytest
```

前端：

```bash
cd frontend
npm install
npm run build
```

## 安全说明

- `.env`、API Key、会话信息和用户上传文件不会进入 Git。
- 写操作使用 Session Cookie 与 CSRF 校验。
- 简历原文和招聘候选文件按所有者与角色隔离。
- 新兴岗位在进入正式目录前需要人工审核，模型结果不会直接发布。

## 文档

- [研究报告与系统技术说明](docs/岗位能力图谱系统_研究报告技术文档.md)
- [后端技术架构详细设计](outputs/岗位能力图谱系统_后端技术架构详细设计.md)
- [数据库与 API 详细设计](outputs/岗位能力图谱系统_数据库与API详细设计.md)

完整接口及请求模型以运行后的 Swagger UI 为准。
