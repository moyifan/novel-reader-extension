// 章节解析模块 - 对齐原脚本兼容策略
import { escapeHtml, generateId } from './utils.js';

// 标题行允许的装饰前缀：emoji、引号、方括号等符号（不含字母/数字/空白）
// 例：`🍎 第275章 基石序列的新标准` 这类站点水印前缀
const HEADING_PREFIX_RE = /^[^\p{L}\p{N}\s]{0,4}/u;

// 数字: 0-9 半角 + ０-９ 全角 + 中文数字(简繁)
// 章节单位: 章/回/卷/节/折/篇/幕/集/話
const CHAPTER_REGEX_LIST = [
  /^[^\p{L}\p{N}\s]{0,4}\s*第?\s*[0-9０-９〇一二两三四五六七八九十○零百千万亿兩]{1,6}\s*[章节回卷节折篇幕集话話][^\n]*/iu
];

const CHAPTER_KEYWORDS = ['章', '回', '卷', '节', '折', '篇', '幕', '集', '話'];
const PURE_CHAPTER_HEADING_REGEX = /^第?\s*[0-9０-９〇一二两三四五六七八九十○零百千万亿兩]{1,6}\s*[章节回卷节折篇幕集话話]\s*$/;

// 需要剥离的 Unicode 空白字符（.trim() 不覆盖的部分）
// 包括：em-space (U+2003), en-space (U+2002), 全角空格 (U+3000), 不换行空格 (U+00A0)
const UNICODE_WHITESPACE_RE = /^[\u00A0\u2000-\u200A\u3000\uFEFF]+|[\u00A0\u2000-\u200A\u3000\uFEFF]+$/g;

/**
 * 提取「第<阿拉伯数字>」中的章节序号，用于判断标题序号是否在递增
 * @param {string} matchedPart
 * @returns {number|null}
 */
function parseArabicChapterIndex(matchedPart) {
  const match = matchedPart.match(/第?\s*([0-9０-９]{1,6})/);
  if (!match) return null;
  const digits = match[1].replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  return Number(digits);
}

/**
 * 判断一个候选行是否为真章节标题（过滤正文中的「第N回」「第N节」误匹配）
 * @param {string} matchedPart - 正则命中的整行片段
 * @param {number|null} lastChapterIndex - 最近一个已识别章节的阿拉伯数字序号
 * @returns {boolean}
 */
function isRealChapterTitle(matchedPart, lastChapterIndex) {
  if (!matchedPart) return true;

  // 取最早出现的关键字位置（标题里可能同时出现「第X卷 第Y章」）
  let keywordIndex = -1;
  for (const kw of CHAPTER_KEYWORDS) {
    const idx = matchedPart.indexOf(kw);
    if (idx !== -1 && (keywordIndex === -1 || idx < keywordIndex)) {
      keywordIndex = idx;
    }
  }

  if (keywordIndex === -1) return true;

  const afterKeyword = matchedPart.substring(keywordIndex + 1);
  // 关键字在行尾，或后面紧跟空白 → 正常标题
  if (afterKeyword.length === 0) return true;
  if (/^[\s\u00A0\u2000-\u200A\u3000]/.test(afterKeyword)) return true;
  // 关键字后紧跟标点/符号（如「第12章：xxx」）→ 正常标题
  if (!/^[\p{L}\p{N}]/u.test(afterKeyword)) return true;

  // 关键字后直接接汉字/数字：既可能是正文误匹配（「第七回廊的低语」「第三节太重」），
  // 也可能是正文与编号之间漏了空格的标题（「第100章借纳垢的刀」）。
  // 仅当序号为阿拉伯数字、且严格大于已知章节号时才按真标题处理。
  const index = parseArabicChapterIndex(matchedPart);
  if (index === null) return false;
  if (lastChapterIndex !== null && index <= lastChapterIndex) return false;

  // 防止把以「第N章」开头的长正文误判成标题
  const strippedTitle = matchedPart.replace(HEADING_PREFIX_RE, '');
  return strippedTitle.length <= 40;
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
  let lastChapterIndex = null; // 最近一个已识别章节的阿拉伯数字序号

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = wideTrim(line);

    let isChapterTitle = false;
    let matchedTitle = null;

    for (const regex of CHAPTER_REGEX_LIST) {
      const match = trimmedLine.match(regex);
      if (!match) continue;
      // 去掉 emoji / 符号装饰前缀，标题更干净：`🍎 第275章 xxx` → `第275章 xxx`
      matchedTitle = match[0].replace(HEADING_PREFIX_RE, '').trim();
      if (isRealChapterTitle(match[0], lastChapterIndex)) {
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
      if (PURE_CHAPTER_HEADING_REGEX.test(chapterTitle)) {
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && nextLine.length > 0 && nextLine.length < 15 && !/^第/.test(nextLine)) {
          chapterTitle = chapterTitle + ' ' + nextLine;
          i++;
        }
      }

      const chapterIndex = parseArabicChapterIndex(chapterTitle);
      if (chapterIndex !== null) lastChapterIndex = chapterIndex;

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
