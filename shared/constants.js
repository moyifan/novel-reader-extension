// 导入繁简转换映射表 - 来自原脚本
import { ZH_zh2Hans, ZH_zh2TW, ZH_zh2CN, ZH_zh2Hant } from './zhTables.js';

// 存储键名常量
export const STORAGE_KEYS = {
  BOOKS: 'books',
  BOOK_INDEX: 'bookIndex',
  BOOK_META_PREFIX: 'bookMeta_',
  BOOK_CONTENT_PREFIX: 'bookContent_',
  BOOK_NOTES_PREFIX: 'bookNotes_',
  SETTINGS: 'settings',
  CURRENT_BOOK_ID: 'currentBookId'
};

// 默认设置
export const DEFAULT_SETTINGS = {
  fontSize: 20,
  fontFamily: "'XHei Intel', '微软雅黑', '宋体', '黑体', '楷体', arial",
  lineHeight: 2,
  pageFlip: 'none',
  autoScroll: false,
  autoScrollSpeed: 30,
  chineseConversion: 'disable',
  customReplaceRules: '',
  notesEnabled: true
};

// 章节正则 - 来自原脚本
// 支持：第X章、第X节、第X回、第X卷 等多种格式
export const CHAPTER_REGEX = /\n第[一二两三四五六七八九十○零百千万亿0-9１２３４５６７８８90〇]{1,6}\s*[章回卷节折篇幕集话話][^\n]+\n/;

// 字体选项
export const FONT_FAMILIES = [
  'Source Han Serif SC',
  '宋体',
  '黑体',
  '微软雅黑',
  '楷体',
  'serif',
  'sans-serif'
];

// 翻页方式
export const PAGE_FLIP_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'click', label: '点击' },
  { value: 'scroll', label: '滚动' }
];

// 转换表 - 来自原脚本
const tw2cnTable = { ...ZH_zh2CN, ...ZH_zh2Hans };  // 繁体转简体
const cn2twTable = { ...ZH_zh2TW, ...ZH_zh2Hant };  // 简体转繁体

// 按长度降序排列的键缓存
const fromLengthCache = new Map();

// strtr 函数 - 来自原脚本，按长度降序替换，长词优先
function strtr(str, table) {
  if (!str || !table) return str;

  let fromLengthArray = fromLengthCache.get(table);
  if (!fromLengthArray) {
    fromLengthArray = [...new Set(Object.keys(table).map(s => s.length))].sort(
      (a, b) => b - a
    );
    fromLengthCache.set(table, fromLengthArray);
  }

  let ret = '';
  const lenStr = str.length;

  for (let i = 0; i < lenStr; i++) {
    let match = false;
    let matchTo = '';

    for (const fromLength of fromLengthArray) {
      const substr = str.substring(i, i + fromLength);
      if (table[substr]) {
        matchTo = table[substr];
        match = true;
        i += fromLength - 1;
        break;
      }
    }

    ret += match ? matchTo : str.charAt(i);
  }

  return ret;
}

// 简繁转换函数
export function convertChinese(text, mode) {
  if (!text) return text;

  switch (mode) {
    case 'to-cn':  // 繁体转简体
      return strtr(text, tw2cnTable);
    case 'to-tw':  // 简体转繁体
      return strtr(text, cn2twTable);
    default:
      return text;
  }
}

// 应用自定义替换规则
export function applyReplaceRules(text, rules) {
  if (!rules || !rules.trim()) return text;

  const lines = rules.split('\n');
  let result = text;

  for (const line of lines) {
    if (!line.includes('=')) continue;
    const idx = line.indexOf('=');
    const pattern = line.substring(0, idx).trim();
    const replacement = line.substring(idx + 1).trim();
    if (!pattern) continue;

    try {
      const regex = new RegExp(pattern, 'g');
      result = result.replace(regex, replacement);
    } catch (e) {
      // 无效的正则表达式，跳过
    }
  }
  return result;
}
