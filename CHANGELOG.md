# CHANGELOG

## workflow-v2 — 2026-10-04

- 精简 CLAUDE.md：579 行 → ~130 行（约 -80% token 成本）。
- 8 阶段门禁合并为 6 阶段：0+1 合并为「概念与需求」，5+6 合并为「测试与试玩」。
- §9 跨会话记忆的完整模板外置到 `docs/templates/templates.md`（含节点 JSON 格式）。
- 删除重复的文件结构定义（原 §4 与 §9.3）、串戏示例（林/火灾故事）、两张 mermaid 图。
- 记忆系统从 6 层压缩为最小集：project-state + 会话日志 + index.json + ADR + lore 卡。
- 新增 `docs/00-project-state.md` 引导文件。
- git 步骤标注为可选（项目尚未 git init）。

## workflow-v2.1 — 2026-10-04

- 补记会话日志 `2026-10-04-01-CLAUDE精简.md`，修复 `00-project-state.md` 引用不存在文件的问题。
- ADR 模板新增 `rejected` 状态与「备选方案」栏位，落实 §2.8/§5 的承诺。
- 阶段 2 门禁补充验证方式：agent 图遍历自查 + 阶段 5 自动校验复核。
- 启用 git：`git init` + 首个提交，打标签 `v0.1-workflow`；移除「尚未 git init」相关注记。
