// 章节解析模块 - 对齐原脚本兼容策略
import { escapeHtml, generateId } from './utils.js';

// 数字: 0-9 半角 + ０-９ 全角 + 中文数字(简繁)
// 章节单位: 章/回/卷/节/折/篇/幕/集/話
const CHAPTER_REGEX_LIST = [
  /^第?\s*[0-9０-９〇一二两三四五六七八九十○零百千万亿兩]{1,6}\s*[章节回卷节折篇幕集话話][^\n]*/im
];

const CHAPTER_KEYWORDS = ['章', '回', '卷', '节', '折', '篇', '幕', '集', '話'];
const PURE_CHAPTER_HEADING_REGEX = /^第?\s*[0-9０-９〇一二两三四五六七八九十○零百千万亿兩]{1,6}\s*[章节回卷节折篇幕集话話]\s*$/;

// 需要剥离的 Unicode 空白字符（.trim() 不覆盖的部分）
// 包括：em-space (U+2003), en-space (U+2002), 全角空格 (U+3000), 不换行空格 (U+00A0)
const UNICODE_WHITESPACE_RE = /^[\u00A0\u2000-\u200A\u3000\uFEFF]+|[\u00A0\u2000-\u200A\u3000\uFEFF]+$/g;

function isRealChapterTitle(matchedPart) {
  if (!matchedPart) return true;

  let keywordIndex = -1;
  for (const kw of CHAPTER_KEYWORDS) {
    const idx = matchedPart.indexOf(kw);
    if (idx !== -1) {
      keywordIndex = idx;
      break;
    }
  }

  if (keywordIndex === -1) return true;

  const afterKeyword = matchedPart.substring(keywordIndex + 1);
  if (afterKeyword.length > 0 && afterKeyword[0] !== ' ' && /[一-龥]/.test(afterKeyword[0])) {
    return false;
  }

  return true;
}

/**
 * 宽泛地去除行首尾的空白字符（包括 Unicode 空白如 em-space U+2003）
 * 专门用于章节标题匹配前的清理
 * @param {string} line
 * @returns {string}
 */
function wideTrim(line) {
  return line.replace(/^[\s\u00A0\u2000-\u200A\u3000\uFEFF]+|[\s\u00A0\u2000-\u200A\u3000\uFEFF]+$/g, '');
}

/**
 * 解析章节
 * @param {string} text - 完整小说文本
 * @returns {Array<{title: string, content: string}>} 章节列表
 */
export function parseChapters(text) {
  const chapters = [];
  const lines = text.split('\n');
  let currentChapter = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = wideTrim(line);

    let isChapterTitle = false;
    let matchedTitle = null;

    for (const regex of CHAPTER_REGEX_LIST) {
      const match = trimmedLine.match(regex);
      if (!match) continue;
      matchedTitle = match[0].replace(/^\n/, '').trim();
      if (isRealChapterTitle(match[0])) {
        isChapterTitle = true;
        break;
      }
    }

    if (isChapterTitle) {
      if (currentChapter !== null) {
        const content = currentContent.join('\n').trim();
        if (content.length > 0) {
          chapters.push({ title: currentChapter, content });
        }
      }

      // 章节标题：沿用 trimmedLine 中的无前导空白版本
      let chapterTitle = matchedTitle || trimmedLine;
      if (matchedTitle === trimmedLine && PURE_CHAPTER_HEADING_REGEX.test(matchedTitle)) {
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && nextLine.length > 0 && nextLine.length < 15 && !/^第/.test(nextLine)) {
          chapterTitle = matchedTitle + ' ' + nextLine;
          i++;
        }
      }

      currentChapter = chapterTitle;
      currentContent = [];
    } else if (currentChapter !== null) {
      // 存入原始行（内含解码后的 Unicode 空白），后续 splitToParagraphs 会用 .trim() 清除
      currentContent.push(line);
    }
  }

  if (currentChapter !== null) {
    const content = currentContent.join('\n').trim();
    if (content.length > 0) {
      chapters.push({ title: currentChapter, content });
    }
  }

  if (chapters.length === 0) {
    chapters.push({ title: '前言', content: text.trim() });
  }

  return chapters;
}

/**
 * 将文本内容拆分为段落
 * @param {string} content - 章节内容
 * @returns {string} HTML 段落字符串
 */
export function splitToParagraphs(content) {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => '<p>' + escapeHtml(line) + '</p>')
    .join('\n');
}

/**
 * 生成书籍 ID
 * @param {string} name - 书名
 * @returns {string} 书籍ID
 */
export function generateBookId(name) {
  return name + '_' + generateId();
}
