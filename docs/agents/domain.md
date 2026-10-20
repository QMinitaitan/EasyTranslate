# Domain Docs

本仓库采用 single-context 布局，共享一套领域术语和架构决策。

## Before exploring

探索相关代码前：

- 如果根目录存在 `GLOSSARY.md`，读取相关术语。
- 如果存在 `docs/adr/`，读取与当前工作相关的架构决策。

这些文件或目录不存在时，直接继续工作。
通过 domain-modeling 在术语或决策实际明确后按需创建。

## File structure

- `GLOSSARY.md`：全项目共享的领域术语。
- `docs/adr/`：全项目共享的架构决策记录。

## Vocabulary

Issue、规格、重构方案、测试和代码中的领域概念，
使用 GLOSSARY.md 中定义的名称。

需要的概念尚未收录时，核对项目实际用语，
再决定是否交由 domain-modeling 补充。

## ADR conflicts

方案与现有 ADR 冲突时，明确指出对应 ADR、
冲突内容和重新讨论的理由。
