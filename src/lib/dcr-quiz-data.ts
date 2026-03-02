/**
 * DCR 考核题库
 *
 * 定义考核题目接口、题库数据、随机抽题函数和评分函数。
 * 所有导出供考核 API 路由和考核页面使用。
 */

/* ========== Types ========== */

/** 考核题目 */
export interface QuizQuestion {
  id: string;
  text: string;
  options: Array<{ key: string; label: string }>;
  correctKey: string;
  explanation: string;
}

/** 评分结果 */
export interface GradeResult {
  passed: boolean;
  score: number;
  total: number;
  corrections?: Array<{
    questionId: string;
    correctKey: string;
    explanation: string;
  }>;
}

/* ========== Quiz Questions ========== */

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    text: '在 DCR 互助区发布工单时，以下哪项信息必须真实准确？',
    options: [
      { key: 'A', label: '学校名称和地址' },
      { key: 'B', label: '个人社交媒体账号' },
      { key: 'C', label: '家庭收入情况' },
      { key: 'D', label: '个人兴趣爱好' },
    ],
    correctKey: 'A',
    explanation: '委托表中的学校名称和地址是核实举报信息的关键依据，必须真实准确。',
  },
  {
    id: 'q2',
    text: '以下哪种行为违反了 DCR 互助区的隐私保护规定？',
    options: [
      { key: 'A', label: '使用匿名方式描述问题' },
      { key: 'B', label: '在工单中公开教师的身份证号码' },
      { key: 'C', label: '描述违规行为的具体时间和地点' },
      { key: 'D', label: '上传学校公开发布的通知截图' },
    ],
    correctKey: 'B',
    explanation: '公开他人身份证号码属于泄露个人隐私，严重违反隐私保护规定。应避免在工单中包含任何个人敏感信息。',
  },
  {
    id: 'q3',
    text: '当你的委托表被管理员拒绝后，正确的做法是？',
    options: [
      { key: 'A', label: '创建多个账号重复提交' },
      { key: 'B', label: '根据拒绝原因修改后重新提交' },
      { key: 'C', label: '在其他平台发布不满言论' },
      { key: 'D', label: '直接联系管理员要求通过' },
    ],
    correctKey: 'B',
    explanation: '被拒绝后应根据管理员给出的拒绝原因修改委托表内容，确保信息完整准确后重新提交。',
  },
  {
    id: 'q4',
    text: '关于 DCR 互助区的工单内容，以下哪项描述是正确的？',
    options: [
      { key: 'A', label: '可以包含未经证实的谣言' },
      { key: 'B', label: '可以使用侮辱性语言描述相关人员' },
      { key: 'C', label: '应基于事实客观描述违规行为' },
      { key: 'D', label: '可以夸大事实以引起关注' },
    ],
    correctKey: 'C',
    explanation: '工单内容应基于事实客观描述，不得包含谣言、侮辱性语言或夸大事实的内容。',
  },
  {
    id: 'q5',
    text: '在填写委托表的「详细描述」时，最低字数要求是多少？',
    options: [
      { key: 'A', label: '10 字' },
      { key: 'B', label: '20 字' },
      { key: 'C', label: '50 字' },
      { key: 'D', label: '100 字' },
    ],
    correctKey: 'B',
    explanation: '委托表的详细描述字段要求至少 20 字，以确保提供足够的信息用于后续处理。',
  },
  {
    id: 'q6',
    text: '以下哪种情况属于平台合规的举报范围？',
    options: [
      { key: 'A', label: '学校组织学生周末强制补课并收费' },
      { key: 'B', label: '对某位老师的教学风格不满' },
      { key: 'C', label: '与同学之间的个人纠纷' },
      { key: 'D', label: '对学校食堂饭菜口味的投诉' },
    ],
    correctKey: 'A',
    explanation: 'DCR 互助区主要处理学校违规补课、提前开学、不双休、校外培训机构违规等教育违规行为的举报。',
  },
  {
    id: 'q7',
    text: '通过考核后加入互助队伍，你应该遵守的首要原则是？',
    options: [
      { key: 'A', label: '尽可能多地发布工单' },
      { key: 'B', label: '保护当事人隐私，遵守平台规则' },
      { key: 'C', label: '在社交媒体上宣传平台' },
      { key: 'D', label: '帮助他人绕过审核流程' },
    ],
    correctKey: 'B',
    explanation: '加入互助队伍后，保护当事人隐私和遵守平台规则是最基本的要求，违反将被取消资格。',
  },
  {
    id: 'q8',
    text: '委托表中的「确认信息」部分要求勾选几项声明？',
    options: [
      { key: 'A', label: '1 项' },
      { key: 'B', label: '2 项' },
      { key: 'C', label: '3 项' },
      { key: 'D', label: '4 项' },
    ],
    correctKey: 'C',
    explanation: '委托表要求勾选 3 项确认声明，包括信息真实性、隐私保护承诺和平台规则遵守，全部勾选后才能提交。',
  },
  {
    id: 'q9',
    text: '如果在填写委托表时系统检测到敏感信息，会发生什么？',
    options: [
      { key: 'A', label: '自动删除敏感内容并提交' },
      { key: 'B', label: '弹出警告但仍可提交' },
      { key: 'C', label: '阻止提交并高亮显示敏感内容' },
      { key: 'D', label: '将表单转发给管理员审核' },
    ],
    correctKey: 'C',
    explanation: '系统会阻止包含敏感信息的表单提交，并使用高亮方式标识敏感内容的位置，用户需修改后才能提交。',
  },
  {
    id: 'q10',
    text: '关于 DCR 互助区的「学校性质」分类，以下哪项不属于可选项？',
    options: [
      { key: 'A', label: '公立学历制学校' },
      { key: 'B', label: '私立学历制学校' },
      { key: 'C', label: '校外培训机构' },
      { key: 'D', label: '家庭教育机构' },
    ],
    correctKey: 'D',
    explanation: '委托表中学校性质仅包含公立学历制学校、私立学历制学校和校外培训机构三个选项，不包含家庭教育机构。',
  },
  {
    id: 'q11',
    text: '在互助区中，以下哪种行为可能导致你的互助资格被取消？',
    options: [
      { key: 'A', label: '按规定流程提交工单' },
      { key: 'B', label: '恶意提交虚假举报信息' },
      { key: 'C', label: '在工单中提供详细的违规证据' },
      { key: 'D', label: '配合管理员的审核要求' },
    ],
    correctKey: 'B',
    explanation: '恶意提交虚假举报信息严重违反平台规则，将导致互助资格被取消，并可能承担相应法律责任。',
  },
  {
    id: 'q12',
    text: '委托表提交后，Case 的初始状态是什么？',
    options: [
      { key: 'A', label: 'CLOSED' },
      { key: 'B', label: 'IN_PROGRESS' },
      { key: 'C', label: 'OPENED' },
      { key: 'D', label: 'RESOLVED' },
    ],
    correctKey: 'C',
    explanation: '委托表提交后创建的 Case 初始状态为 OPENED（待审核），管理员审核通过后变为 IN_PROGRESS。',
  },
];

/* ========== Pure Functions ========== */

/**
 * 从题库中随机抽取指定数量的不重复题目。
 * 使用 Fisher-Yates 洗牌算法的部分洗牌变体。
 */
export function pickRandomQuestions(count: number): QuizQuestion[] {
  if (count <= 0) return [];
  const pool = [...QUIZ_QUESTIONS];
  const n = Math.min(count, pool.length);

  // Fisher-Yates partial shuffle: only shuffle the first `n` elements
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, n);
}

/**
 * 对考核答案进行评分。
 *
 * - 正确数 ≥ 4 → passed=true，不返回 corrections
 * - 正确数 < 4 → passed=false，corrections 仅包含答错题目
 */
export function gradeQuiz(
  questions: QuizQuestion[],
  answers: Array<{ questionId: string; selectedKey: string }>,
): GradeResult {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedKey]));

  let score = 0;
  const corrections: Array<{
    questionId: string;
    correctKey: string;
    explanation: string;
  }> = [];

  for (const q of questions) {
    const selected = answerMap.get(q.id);
    if (selected === q.correctKey) {
      score++;
    } else {
      corrections.push({
        questionId: q.id,
        correctKey: q.correctKey,
        explanation: q.explanation,
      });
    }
  }

  const passed = score >= 4;

  if (passed) {
    return { passed: true, score, total: questions.length };
  }

  return { passed: false, score, total: questions.length, corrections };
}
