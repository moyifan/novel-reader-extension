// 导入繁简转换映射表 - 来自原脚本
import { ZH_zh2Hans, ZH_zh2TW, ZH_zh2CN, ZH_zh2Hant } from './zhTables.js';

// 存储键名常量
export const STORAGE_KEYS = {
  BOOKS: 'books',
  SETTINGS: 'settings',
  CURRENT_BOOK_ID: 'currentBookId'
};

// 默认设置
export const DEFAULT_SETTINGS = {
  theme: 'eye-care',
  fontSize: 20,
  fontFamily: "'XHei Intel', '微软雅黑', '宋体', '黑体', '楷体', arial",
  lineHeight: 2,
  pageFlip: 'none',
  autoScroll: false,
  autoScrollSpeed: 30,
  chineseConversion: 'disable',
  customReplaceRules: ''
};

// 主题配置
export const THEMES = {
  light: {
    name: '白天',
    background: '#FFFFFF',
    text: '#333333',
    buttonBg: '#F8F9FA',
    accent: '#007BFF'
  },
  sepia: {
    name: '护眼',
    background: '#F4ECD8',
    text: '#5B4636',
    buttonBg: '#EDE4D3',
    accent: '#8B4513'
  },
  dark: {
    name: '夜间',
    background: '#1A1A1A',
    text: '#E0E0E0',
    buttonBg: '#2D2D2D',
    accent: '#6DB3F2'
  },
  'eye-care': {
    name: '深色',
    background: '#C8E6C9',
    text: '#2E4A2E',
    buttonBg: '#A5D6A7',
    accent: '#4CAF50'
  }
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

// 皮肤定义 - 来自 userscript 8.0.5
export const SKINS = {
  "缺省皮肤": "",
  "暗色皮肤": "body { color: #666; background-color: rgba(0,0,0,.1); } .title { color: #222; }",
  "白底黑字": "body { color: black; background-color: white;} .title { font-weight: bold; border-bottom: 0.1em solid; margin-bottom: 1.857em; padding-bottom: 0.857em;}",
  "夜间模式": "body { color: #939392; background: #2d2d2d; } .reader-actions { filter: invert(90%); } .chapter-content img { background-color: #c0c0c0; } .chapter-title { color: #939392; }",
  "夜间模式1": "body { color: #679; background-color: black; } .reader-actions { filter: invert(90%); } .chapter-title { color: #3399FF; background-color: #121212; }",
  "夜间模式2": "body { color: #AAAAAA; background-color: #121212; } .reader-actions { filter: invert(90%); } .chapter-content img { background-color: #c0c0c0; } .chapter-title { color: #3399FF; background-color: #121212; } a { color: #E0BC2D; } a:link { color: #E0BC2D; } a:visited { color:#AAAAAA; } a:hover { color: #3399FF; } a:active { color: #423F3F; }",
  "夜间模式（多看）": "body { color: #4A4A4A; background: #101819; } .reader-actions { filter: invert(90%); } .chapter-content img { background-color: #c0c0c0; }",
  "橙色背景": "body { color: #24272c; background-color: #FEF0E1; }",
  "绿色背景": "body { color: black; background-color: #d8e2c8; }",
  "绿色背景2": "body { color: black; background-color: #CCE8CF; }",
  "蓝色背景": "body { color: black; background-color: #E7F4FE; }",
  "棕黄背景": "body { color: black; background-color: #C2A886; }",
  "经典皮肤": "body { color: black; background-color: #EAEAEE; } .chapter-title { background-color: #f0f0f0; }",
  "绿色亮字": "body, .toc-sidebar, .reader-header { color: rgb(187,215,188); background-color: rgb(18,44,20); } .reader-actions { filter: invert(90%); }",
  "图书双层": "body { color: #black; background: #ECE8D7; } .reader-main { background: #E8E6DA; padding-left: 4rem; padding-right: 4rem; border: 1px solid rgba(211,211,211,0.25); }"
};

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
