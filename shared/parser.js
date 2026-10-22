// 章节解析模块 - 对齐原脚本兼容策略
import { escapeHtml, generateId } from './utils.js';
import {
  detectFanqie,
  parseFanqieMeta,
  parseFanqieAppendix,
  stripFanqieMarkers,
  FANQIE_APPENDIX_RE,
  FANQIE_EXPORT_HEAD_RE,
  FANQIE_TIME_RE
} from './fanqie.js';

// 标题行允许的装饰前缀：emoji、引号、方括号等符号（不含字母/数字/空白）
// 例：`🍎 第275章 基石序列的新标准` 这类站点水印前缀
const HEADING_PREFIX_RE = /^[^\p{L}\p{N}\s]{0,4}/u;

// 数字: 0-9 半角 + ０-９ 全角 + 中文数字(简繁)
// 章节单位: 章/回/卷/节/折/篇/幕/集/話
const CHAPTER_REGEX_LIST = [
  /^[^\p{L}\p{N}\s]{0,4}\s*第?\s*[0-9０-９〇一二两三四五六七八九十○零百千万亿兩]{1,6}\s*[章节回卷节折篇幕集话話][^\n]*/iu
];

const CHAPTER_KEYWORDS = ['章', '回', '卷', '节', '折', '篇', '幕', '集', '话', '話'];
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
 * 向下寻找第一行非空内容（番茄格式的附录内标题校验用）
 * @param {string[]} lines
 * @param {number} start
 * @returns {string}
 */
function findNextNonEmptyLine(lines, start) {
  for (let i = start; i < lines.length; i++) {
    const trimmed = wideTrim(lines[i]);
    if (trimmed) return trimmed;
  }
  return '';
}

/**
 * 把章末段评附录解析成「段落下标 -> 评论列表」
 *
 * 定位优先级：
 * 1. 正文内联标记 〔段评N〕 所在的段落（最可靠，标记就在正文里）
 * 2. 附录条目的「原始段索引」（导出器可能写错，仅作兜底）
 * 3. 都对不上的归入 orphans（章末段评），不丢数据
 *
 * @param {string[]} appendixLines - 附录原始行
 * @param {Map<number, number>} markerParas - 标记序号 N -> 段落下标
 * @param {number} paragraphCount - 本章段落数
 * @returns {{total: number, spans: Array, orphans: Array}|null}
 */
function buildFanqieNotes(appendixLines, markerParas, paragraphCount) {
  const entries = parseFanqieAppendix(appendixLines);
  if (entries.size === 0) return null;

  const spanMap = new Map(); // para -> { para, comments: [] }
  const orphans = [];
  let total = 0;

  for (const entry of entries.values()) {
    if (entry.comments.length === 0) continue;

    let para = markerParas.has(entry.n) ? markerParas.get(entry.n) : null;
    if (para === null && /^\d+$/.test(entry.rawIndex)) {
      const raw = Number(entry.rawIndex);
      if (raw < paragraphCount) para = raw;
    }

    if (para === null) {
      orphans.push({ rawIndex: entry.rawIndex, comments: entry.comments });
    } else {
      if (!spanMap.has(para)) spanMap.set(para, { para, comments: [] });
      spanMap.get(para).comments.push(...entry.comments);
    }
    total += entry.comments.length;
  }

  if (total === 0) return null;

  const spans = [...spanMap.values()].sort((a, b) => a.para - b.para);
  for (const span of spans) {
    span.comments.sort((a, b) => b.likes - a.likes);
  }

  return { total, spans, orphans };
}

/**
 * 解析章节
 *
 * 默认行为与原实现完全一致；传入 `{ fanqie: true }` 时才启用番茄导出格式清洗：
 * 剥离「章节更新时间」行、正文内联〔段评N〕标记、章末整块段评附录，
 * 并把段评解析成 chapter.notes（不丢数据，供阅读器渲染）。
 *
 * @param {string} text - 完整小说文本
 * @param {{fanqie?: boolean}} [options]
 * @returns {Array<{title: string, content: string, notes?: object}>} 章节列表
 */
export function parseChapters(text, options = {}) {
  const fanqie = options.fanqie === true;
  const chapters = [];
  const lines = text.split('\n');
  let currentChapter = null;
  let currentContent = [];
  let lastChapterIndex = null; // 最近一个已识别章节的阿拉伯数字序号

  // 番茄格式状态（仅在 fanqie 模式下使用）
  let inAppendix = false;
  let appendixLines = [];
  let markerParas = new Map();
  let paragraphCount = 0;

  const flushChapter = () => {
    if (currentChapter === null) return;
    const content = currentContent.join('\n').trim();
    if (content.length === 0) return;

    const chapter = { title: currentChapter, content };
    if (fanqie && appendixLines.length > 0) {
      const notes = buildFanqieNotes(appendixLines, markerParas, paragraphCount);
      if (notes) chapter.notes = notes;
    }
    chapters.push(chapter);
  };

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

    // 番茄格式的段评附录里可能有人评论「第N章…」，用「下一行是章节更新时间」确认是真标题，
    // 避免把读者评论误切成章节
    if (isChapterTitle && fanqie && inAppendix) {
      const nextLine = findNextNonEmptyLine(lines, i + 1);
      if (nextLine && !FANQIE_TIME_RE.test(nextLine)) {
        isChapterTitle = false;
      }
    }

    if (isChapterTitle) {
      flushChapter();
      inAppendix = false;
      appendixLines = [];
      markerParas = new Map();
      paragraphCount = 0;

      // 章节标题：沿用 trimmedLine 中的无前导空白版本
      let chapterTitle = matchedTitle || trimmedLine;
      if (PURE_CHAPTER_HEADING_REGEX.test(chapterTitle)) {
        const nextLine = lines[i + 1]?.trim();
        if (
          nextLine &&
          nextLine.length > 0 &&
          nextLine.length < 15 &&
          !/^第/.test(nextLine) &&
          !(fanqie && FANQIE_TIME_RE.test(nextLine))
        ) {
          chapterTitle = chapterTitle + ' ' + nextLine;
          i++;
        }
      }

      const chapterIndex = parseArabicChapterIndex(chapterTitle);
      if (chapterIndex !== null) lastChapterIndex = chapterIndex;

      currentChapter = chapterTitle;
      currentContent = [];
    } else if (currentChapter !== null) {
      if (fanqie) {
        // 附录开始：之后的行全部交给段评解析，不进正文
        if (FANQIE_APPENDIX_RE.test(trimmedLine) || FANQIE_EXPORT_HEAD_RE.test(trimmedLine)) {
          inAppendix = true;
          continue;
        }
        if (inAppendix) {
          appendixLines.push(line);
          continue;
        }
        // 章节更新时间行：纯导出噪音，直接丢弃
        if (FANQIE_TIME_RE.test(trimmedLine)) continue;

        const { line: cleanedLine, markers } = stripFanqieMarkers(line);
        const hasText = wideTrim(cleanedLine).length > 0;

        // 记录标记所在段落：标记在行尾，段落即当前待入正文的这一行
        if (markers.length > 0) {
          const para = hasText ? paragraphCount : Math.max(paragraphCount - 1, 0);
          for (const n of markers) {
            if (!markerParas.has(n)) markerParas.set(n, para);
          }
        }
        if (hasText) paragraphCount++;

        currentContent.push(cleanedLine);
      } else {
        // 存入原始行（内含解码后的 Unicode 空白），后续 splitToParagraphs 会用 .trim() 清除
        currentContent.push(line);
      }
    }
  }

  flushChapter();

  if (chapters.length === 0) {
    chapters.push({ title: '前言', content: text.trim() });
  }

  return chapters;
}

/**
 * 解析整本书（自动识别番茄导出格式）
 *
 * 非番茄格式：format 为 null，章节结果与 parseChapters(text) 完全一致（不清洗、不改动任何行）。
 *
 * @param {string} text
 * @returns {{format: 'fanqie'|null, meta: object|null, chapters: Array}}
 */
export function parseNovel(text) {
  if (detectFanqie(text)) {
    return {
      format: 'fanqie',
      meta: parseFanqieMeta(text),
      chapters: parseChapters(text, { fanqie: true })
    };
  }

  return { format: null, meta: null, chapters: parseChapters(text) };
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
