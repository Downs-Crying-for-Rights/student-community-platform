# 需求文档：DCR 四步互助流程改造

## 简介

将 DCR 互助系统从现有的「准入申请 → 工单创建」两步流程，重构为「填写委托表 → 审核 → 考核 → 加入互助队伍」四步互助线。新流程通过结构化委托表收集详细信息、管理员审核把关、教程学习与答题考核、最终加入互助队伍，提升互助流程的规范性和用户准备度。

## 术语表

- **DCR_System**：DCR 互助系统，负责管理互助流程的核心模块
- **Delegation_Form**：委托表，用户填写的结构化表单，包含学校信息、举报途径、收费情况、诉求等字段
- **Flow_State**：流程状态，根据 Case 状态、quizPassed、dcrAccess 计算得出的当前步骤编号（1-4）
- **Case**：工单记录，存储委托表数据和审核状态，状态包括 OPENED（待审核）、IN_PROGRESS（审核通过）、CLOSED（已关闭/拒绝）
- **Quiz_System**：考核系统，包含教程学习和答题测试两个阶段
- **Question_Pool**：题库，包含 10 道以上考核题目
- **WizardStepper**：步骤进度条组件，用于展示四步流程进度
- **PrivacyBanner**：隐私提醒横幅组件，在涉及敏感信息的页面顶部展示
- **SensitiveHighlight**：敏感信息高亮组件，用于标识和高亮文本中的敏感内容
- **DCRCategory**：DCR 分类枚举，包括 TUTORING、FEES、WEEKENDS、OTHER、EARLY_START、NO_WEEKENDS、EXTERNAL_TRAINING
- **Content_Type**：内容类型，委托表中的分类选项，映射到 DCRCategory 枚举值
- **School_Category**：学校性质，包括公立学历制学校、私立学历制学校、校外培训机构
- **School_Type**：学校类型，根据学校性质动态变化的选项列表

## 需求

### 需求 1：四步流程总览页

**用户故事：** 作为用户，我希望在 DCR 入口页看到清晰的四步流程进度，以便了解当前所处步骤和后续操作。

#### 验收标准

1. WHEN 用户访问 `/dcr` 页面, THE DCR_System SHALL 使用 WizardStepper 组件展示四步流程进度条（填写委托表 → 审核 → 考核 → 加入互助队伍）
2. WHEN 用户无 Case 记录或最新 Case 状态为 CLOSED, THE DCR_System SHALL 将 Flow_State 计算为步骤 1 并显示「填写委托表」操作按钮
3. WHEN 用户最新 Case 状态为 OPENED, THE DCR_System SHALL 将 Flow_State 计算为步骤 2 并显示「等待审核」状态提示
4. WHEN 用户最新 Case 状态为 IN_PROGRESS 且 quizPassed 为 false, THE DCR_System SHALL 将 Flow_State 计算为步骤 3 并显示「前往考核」操作按钮
5. WHEN quizPassed 为 true, THE DCR_System SHALL 将 Flow_State 计算为步骤 4 并显示「加入互助队伍」操作按钮或已加入状态
6. WHEN 用户最新 Case 被拒绝（状态为 CLOSED）, THE DCR_System SHALL 显示拒绝原因和「重新提交」按钮

### 需求 2：委托表表单设计

**用户故事：** 作为用户，我希望通过结构化的委托表提交详细的举报信息，以便管理员能够准确了解情况并进行审核。

#### 验收标准

1. THE Delegation_Form SHALL 包含 7 个区块：内容类型、学校信息、举报途径、详细描述、补课收费情况、诉求、确认信息
2. THE Delegation_Form SHALL 提供内容类型单选组，选项包括：学校补课类、学校提前开学类、学校不双休类、校外培训机构类、其他
3. THE Delegation_Form SHALL 提供学校信息区块，包含学校名称（文本输入）、学校性质（下拉选择）、学校类型（下拉选择）、学校地址（文本输入）四个字段
4. THE Delegation_Form SHALL 将学校名称、学校性质、学校类型、学校地址设为必填字段
5. WHEN 用户选择学校性质时, THE Delegation_Form SHALL 根据所选学校性质动态更新学校类型选项列表：公立学历制学校和私立学历制学校对应小学、初级中学、高级中学、职业技术学校、技工学校、中等专业学校、普通高校；校外培训机构对应校外培训机构
6. THE Delegation_Form SHALL 提供举报途径多行文本输入字段，最大长度为 500 字符
7. THE Delegation_Form SHALL 提供详细描述多行文本输入字段，最小长度为 20 字符，最大长度为 5000 字符
8. WHEN 详细描述字段内容少于 20 字符时, THE Delegation_Form SHALL 在字段下方显示「详细描述至少 20 字」错误提示
9. THE Delegation_Form SHALL 提供可展开的描述模板面板，包含补课、提前开学、政策允许补课但违规提前开学、校外培训机构、不双休五种模板
10. WHEN 用户选择描述模板时, THE Delegation_Form SHALL 将模板内容填充到详细描述字段
11. THE Delegation_Form SHALL 提供补课收费情况单选组，选项包括：未收费、已收费、不清楚
12. WHEN 用户选择「已收费」时, THE Delegation_Form SHALL 显示收费详情文本输入字段
13. THE Delegation_Form SHALL 提供诉求多选组，选项包括：停止补课、退还费用、要求教育局暗访、按照正常时间开学、对相关人员作出处理、其他；至少选择一项
14. THE Delegation_Form SHALL 提供 3 个确认复选框，全部勾选后方可提交表单

### 需求 3：隐私保护

**用户故事：** 作为用户，我希望在填写委托表时得到隐私保护提醒，并在提交前自动检测敏感信息，以防止个人信息泄露。

#### 验收标准

1. THE Delegation_Form SHALL 在页面顶部显示 PrivacyBanner 隐私提醒横幅
2. THE Delegation_Form SHALL 使用 SensitiveHighlight 组件高亮显示文本字段中的敏感信息
3. WHEN 用户提交委托表时, THE DCR_System SHALL 对所有文本字段执行敏感信息检测
4. IF 敏感信息检测发现敏感内容, THEN THE DCR_System SHALL 阻止表单提交并使用 SensitiveHighlight 标识敏感内容位置
5. WHILE 文本字段中存在敏感信息, THE DCR_System SHALL 保持提交按钮禁用状态

### 需求 4：委托表提交与数据存储

**用户故事：** 作为用户，我希望提交委托表后系统自动创建工单记录，以便管理员进行审核。

#### 验收标准

1. WHEN 用户提交通过校验的委托表时, THE DCR_System SHALL 调用 POST /api/cases 创建状态为 OPENED 的 Case 记录
2. THE DCR_System SHALL 将委托表数据完整存储在 Case.formData JSON 字段中，存储数据与提交数据保持一致
3. THE DCR_System SHALL 通过 formatDelegation 纯函数将委托表数据格式化为包含声明文本、学校名称、性质-类型、地址、举报途径、行为描述、收费情况、诉求列表、生成时间的固定格式文本

### 需求 5：审核流程

**用户故事：** 作为管理员，我希望审核用户提交的委托表，以便决定是否允许用户进入考核阶段。

#### 验收标准

1. WHEN 管理员审核通过委托表时, THE DCR_System SHALL 将 Case 状态从 OPENED 更新为 IN_PROGRESS
2. WHEN 管理员拒绝委托表时, THE DCR_System SHALL 将 Case 状态从 OPENED 更新为 CLOSED 并记录拒绝原因
3. WHEN Case 状态变更时, THE DCR_System SHALL 重新计算用户的 Flow_State 并更新入口页展示

### 需求 6：考核页面教程阶段

**用户故事：** 作为用户，我希望在答题前学习相关教程内容，以便充分了解互助规范和流程。

#### 验收标准

1. THE Quiz_System SHALL 在考核页面提供多章节教程内容展示
2. WHEN 用户未完成所有教程章节的阅读时, THE Quiz_System SHALL 保持答题按钮禁用状态
3. WHEN 用户完成所有教程章节的阅读时, THE Quiz_System SHALL 解锁答题按钮
4. THE Quiz_System SHALL 追踪用户的滚动阅读进度并显示进度指示
5. WHILE 用户处于教程阶段, THE Quiz_System SHALL 显示教程内容和进度指示，隐藏答题区域

### 需求 7：考核答题与评分

**用户故事：** 作为用户，我希望通过答题测试证明我已掌握互助规范，以便获得加入互助队伍的资格。

#### 验收标准

1. THE Quiz_System SHALL 从 Question_Pool 中随机抽取 5 道不重复的单选题
2. WHEN 用户提交答案且正确数量大于等于 4 题时, THE Quiz_System SHALL 判定为通过并将 quizPassed 设置为 true
3. THE Quiz_System SHALL 使用 zod 校验答案格式，答案数组长度恰好为 5，每项包含 questionId 和 selectedKey
4. WHEN 用户未通过考核时, THE Quiz_System SHALL 返回错题的正确答案和解析说明，并允许重新答题
5. THE Quiz_System SHALL 返回评分结果，包含 passed 状态、得分 score 和总题数 total
6. THE Quiz_System SHALL 在返回题目时排除 correctKey 字段，防止答案泄露

### 需求 8：考核 API 访问控制

**用户故事：** 作为系统，我需要确保只有符合条件的用户才能访问考核功能，以维护流程的完整性。

#### 验收标准

1. THE Quiz_System SHALL 通过 GET /api/dcr/quiz 端点提供考核题目，通过 POST /api/dcr/quiz 端点接收答案提交
2. WHEN 用户拥有 IN_PROGRESS 状态的 Case 且 quizPassed 为 false 时, THE Quiz_System SHALL 允许访问 GET /api/dcr/quiz 并返回 200 状态码和题目数据
3. WHEN 用户的 quizPassed 为 true 时, THE Quiz_System SHALL 对 GET /api/dcr/quiz 请求返回 409 状态码和「已通过考核」错误信息
4. THE Quiz_System SHALL 对 POST /api/dcr/quiz 请求使用 withAuth 中间件验证用户身份
5. WHEN 用户无审核通过的 Case 时, THE Quiz_System SHALL 对 GET /api/dcr/quiz 请求返回 403 状态码和「请先完成委托表审核」错误信息

### 需求 9：加入互助队伍

**用户故事：** 作为用户，我希望在通过考核后加入互助队伍，以便正式参与 DCR 互助工作。

#### 验收标准

1. WHEN 用户的 quizPassed 为 true 且 dcrAccess 为 false 时, THE DCR_System SHALL 允许 POST /api/dcr/join 请求并将 dcrAccess 设置为 true
2. WHEN 用户的 quizPassed 为 false 时, THE DCR_System SHALL 对 POST /api/dcr/join 请求返回 403 状态码和「请先完成考核」错误信息
3. WHEN 用户的 dcrAccess 为 true 时, THE DCR_System SHALL 对 POST /api/dcr/join 请求返回 409 状态码和「已加入互助队伍」错误信息
4. WHEN 用户成功加入互助队伍时, THE DCR_System SHALL 记录审计日志

### 需求 10：DCRCategory 枚举扩展

**用户故事：** 作为系统，我需要扩展 DCRCategory 枚举以支持新的委托表内容类型分类。

#### 验收标准

1. THE DCR_System SHALL 在 DCRCategory 枚举中新增 EARLY_START（提前开学）、NO_WEEKENDS（不双休）、EXTERNAL_TRAINING（校外培训）三个值
2. THE DCR_System SHALL 保持现有 TUTORING、FEES、WEEKENDS、OTHER 枚举值不变
3. THE DCR_System SHALL 提供内容类型到 DCRCategory 的映射：学校补课类 → TUTORING、学校提前开学类 → EARLY_START、学校不双休类 → NO_WEEKENDS、校外培训机构类 → EXTERNAL_TRAINING、其他 → OTHER
4. THE DCR_System SHALL 同步更新 zod 校验 schema 和前端分类常量以包含新增枚举值
