// 存储键名常量
export const STORAGE_KEYS = {
  BOOKS: 'books',
  SETTINGS: 'settings',
  BOOKMARKS: 'bookmarks',
  CURRENT_BOOK_ID: 'currentBookId'
};

// 默认设置
export const DEFAULT_SETTINGS = {
  theme: 'eye-care',
  fontSize: 18,
  fontFamily: 'Source Han Serif SC',
  lineHeight: 1.8,
  pageFlip: 'none',
  autoScroll: false,
  autoScrollSpeed: 30
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

// 章节正则 - 来自原 Flask 应用
export const CHAPTER_REGEX = /\n第[一二三四五六七八九十百千万1234567890]+[章节].*\n/;

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