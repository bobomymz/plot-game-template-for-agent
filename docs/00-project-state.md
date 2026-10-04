# 项目状态

current_phase: 1 概念与需求（尚未开始提问，模板待复用）
current_version: workflow-v2.4
last_session: 2026-10-04-05-校验前移与文风指南
next_gate: 用户确认需求规格与概念圣经

frozen: {}            # 尚无冻结内容

open_questions: []    # 阶段1 提问清单一并整理

next_actions:
  - 复用于新游戏项目时，从阶段1需求澄清提问清单开始

notes:
  - 2026-10-04（会话01）：CLAUDE.md 由 579 行精简至 ~130 行，8 阶段合并为 6 阶段，模板外置到 docs/templates/。
  - 2026-10-04（会话02）：评估工作流文档，落 4 项修正：补会话日志01、ADR 模板加 rejected/备选方案、阶段2门禁标注验证方式、git init 并打标签 v0.1-workflow。
  - 2026-10-04（会话03）：质量评估 88/100；去题材化改为可复用模板（ADR-0001）；templates.md 补变量表/结局表模板；阶段3 要求回填常用命令。
  - 2026-10-04（会话04）：复评 91/100；落 P1×2：templates.md 新增 §9 新项目初始化清单、§6 节点 schema 修正（每章一文件数组、next/choices 二选一、effects 统一 delta/set、conditions 定为进入条件）；新增 .gitignore。
  - 2026-10-04（会话05）：落 P2×2/P3×3：最小校验脚本提前到阶段3与数据模型同落地、阶段4前冻结文风指南（templates.md §10）、存档版本迁移点名、校验清单补值域越界与 index/lore 一致性、variables 模板加 min/max、templates.md 体积阈值约 400 行。
  - 仓库定位：可复用的剧情游戏工作流模板母本，不含具体游戏设定；新项目复制整套文档后从阶段 1 开始。
