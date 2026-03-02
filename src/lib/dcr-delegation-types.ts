/**
 * DCR 委托表相关类型与常量
 *
 * 定义委托表表单数据接口、枚举映射、选项列表、描述模板，
 * 以及格式化输出纯函数。所有导出供委托表页面和 API 路由使用。
 */

/* ========== Types ========== */

/** 委托表表单数据 */
export interface DelegationFormData {
  contentType: string;
  schoolName: string;
  schoolCategory: string;
  schoolType: string;
  schoolAddress: string;
  reportChannels: string;
  description: string;
  feeStatus: 'none' | 'charged' | 'unknown';
  feeDetails?: string;
  demands: string[];
  otherDemand?: string;
}

/* ========== Constants ========== */

/** 内容类型 → DCRCategory 映射 */
export const CONTENT_TYPE_MAP: Record<string, string> = {
  '学校补课类': 'TUTORING',
  '学校提前开学类': 'EARLY_START',
  '学校不双休类': 'NO_WEEKENDS',
  '校外培训机构类': 'EXTERNAL_TRAINING',
  '其他': 'OTHER',
};

/** 学校性质 → 学校类型选项映射 */
export const SCHOOL_TYPE_OPTIONS: Record<string, string[]> = {
  '公立学历制学校': ['小学', '初级中学', '高级中学', '职业技术学校', '技工学校', '中等专业学校', '普通高校'],
  '私立学历制学校': ['小学', '初级中学', '高级中学', '职业技术学校', '技工学校', '中等专业学校', '普通高校'],
  '校外培训机构': ['校外培训机构'],
};

/** 诉求选项列表 */
export const DEMAND_OPTIONS: string[] = [
  '停止补课',
  '退还费用',
  '要求教育局暗访',
  '按照正常时间开学',
  '对相关人员作出处理',
  '其他',
];

/** 描述模板映射 */
export const DESCRIPTION_TEMPLATES: Record<string, string> = {
  '补课': [
    '本人是该校学生/家长，该校于____年____月____日起组织学生进行补课。',
    '补课时间为：____（如：周六全天、寒假前两周等）。',
    '补课年级/班级为：____。',
    '补课地点为：____（如：本校教室、校外租用场地等）。',
    '补课科目为：____。',
    '是否收取费用：____。',
  ].join('\n'),
  '提前开学': [
    '本人是该校学生/家长，该校要求学生于____年____月____日到校，',
    '而教育部门规定的开学时间为____年____月____日。',
    '提前到校后安排的内容为：____（如：上新课、考试、军训等）。',
  ].join('\n'),
  '政策允许补课但违规提前开学': [
    '本人是该校学生/家长，该校虽在政策允许范围内进行补课，',
    '但要求学生于____年____月____日提前到校，',
    '而教育部门规定的开学时间为____年____月____日。',
    '提前到校后安排的内容为：____。',
  ].join('\n'),
  '校外培训机构': [
    '本人是该机构学员/家长，该机构名称为____，地址位于____。',
    '该机构存在以下违规行为：____（如：无证经营、超时培训、虚假宣传等）。',
    '具体情况为：____。',
  ].join('\n'),
  '不双休': [
    '本人是该校学生/家长，该校未按规定实行双休制度。',
    '目前的休息安排为：____（如：单休、隔周休、月休等）。',
    '该情况从____年____月起开始。',
    '涉及年级/班级为：____。',
  ].join('\n'),
};

/* ========== Pure Functions ========== */

const FEE_STATUS_LABELS: Record<string, string> = {
  none: '未收费',
  charged: '已收费',
  unknown: '不清楚',
};

/**
 * 将委托表数据格式化为可读文本。
 *
 * 输出包含：声明文本、学校名称、性质-类型、地址、举报途径、
 * 行为描述、收费情况、诉求列表、生成时间。
 */
export function formatDelegation(data: DelegationFormData): string {
  const lines: string[] = [];

  // 声明文本
  lines.push('【声明】本人承诺以下信息真实有效，愿承担因虚假信息产生的一切后果。');
  lines.push('');

  // 学校名称
  lines.push(`【学校名称】${data.schoolName}`);

  // 性质-类型
  lines.push(`【性质-类型】${data.schoolCategory} - ${data.schoolType}`);

  // 地址
  lines.push(`【地址】${data.schoolAddress}`);

  // 举报途径
  lines.push(`【举报途径】${data.reportChannels || '无'}`);

  // 行为描述
  lines.push(`【行为描述】${data.description}`);

  // 收费情况
  const feeLabel = FEE_STATUS_LABELS[data.feeStatus] ?? data.feeStatus;
  const feeText = data.feeStatus === 'charged' && data.feeDetails
    ? `${feeLabel}（${data.feeDetails}）`
    : feeLabel;
  lines.push(`【收费情况】${feeText}`);

  // 诉求列表
  const demandList = [...data.demands];
  if (data.otherDemand) {
    demandList.push(data.otherDemand);
  }
  lines.push(`【诉求】${demandList.join('、')}`);

  // 生成时间
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  lines.push(`【生成时间】${ts}`);

  return lines.join('\n');
}
