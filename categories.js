'use strict';

/* 智能分类：根据项目名称/语音文本归入分类组，并提供图标与颜色。 */

const CATEGORY_GROUPS = [
  { group: '餐饮', icon: '🍜', color: '#f59e0b', keywords: ['早餐', '午餐', '晚餐', '夜宵', '吃', '饭', '餐', '咖啡', '奶茶', '外卖', '零食', '水果', '蔬菜', '买菜', '聚餐', '火锅', '烧烤', '快餐', '饮料'] },
  { group: '交通', icon: '🚗', color: '#3b82f6', keywords: ['打车', '地铁', '公交', '加油', '停车', '高铁', '火车', '机票', '飞机', '滴滴', '车费', '过路费', '高速', '油费', '出行', '共享单车'] },
  { group: '购物', icon: '🛍️', color: '#ec4899', keywords: ['买', '衣服', '鞋', '购物', '淘宝', '京东', '拼多多', '数码', '化妆品', '日用品', '家电', '电器', '包'] },
  { group: '居住', icon: '🏠', color: '#8b5cf6', keywords: ['房租', '水费', '电费', '燃气', '物业', '宽带', '房贷', '租金', '取暖', '装修'] },
  { group: '娱乐', icon: '🎮', color: '#06b6d4', keywords: ['电影', '游戏', '旅游', '门票', 'KTV', '唱歌', '健身', '运动', '演唱会', '会员', '订阅'] },
  { group: '医疗', icon: '💊', color: '#ef4444', keywords: ['药', '医院', '看病', '体检', '挂号', '诊所', '牙医', '保健'] },
  { group: '通讯', icon: '📱', color: '#14b8a6', keywords: ['话费', '流量', '手机', '电话费', '充值', '宽带费'] },
  { group: '教育', icon: '📚', color: '#6366f1', keywords: ['学费', '书', '培训', '课程', '辅导', '文具', '考试'] },
  { group: '人情', icon: '🎁', color: '#f43f5e', keywords: ['红包', '礼物', '随礼', '请客', '送礼', '份子钱'] },
  { group: '工资', icon: '💰', color: '#16a34a', keywords: ['工资', '薪水', '薪资', '月薪', '工钱'] },
  { group: '奖金', icon: '🏆', color: '#22c55e', keywords: ['奖金', '提成', '年终奖', '分红', '红利'] },
  { group: '收入', icon: '📈', color: '#10b981', keywords: ['收入', '报销', '退款', '利息', '收款', '进账', '入账', '兼职', '外快'] },
];

const DEFAULT_GROUP = { group: '其他', icon: '📌', color: '#94a3b8' };

// 根据文本（项目名 + 原始语音）推断分类组
function classify(text) {
  for (const g of CATEGORY_GROUPS) {
    if (g.keywords.some((k) => text.includes(k))) {
      return { group: g.group, icon: g.icon, color: g.color };
    }
  }
  return { ...DEFAULT_GROUP };
}

// 取分类组的展示信息（图标/颜色），找不到则用默认
function groupMeta(groupName) {
  const g = CATEGORY_GROUPS.find((x) => x.group === groupName);
  return g ? { group: g.group, icon: g.icon, color: g.color } : { ...DEFAULT_GROUP };
}

window.Categories = { classify, groupMeta };
