// 番茄小说导出格式（正文内联〔段评N〕+ 章末【本章段评（选摘）】附录）专用解析
//
// 设计约束：本模块的函数只在 parser 检测到番茄导出特征后才会被调用，
// 普通 txt 的章节解析链路（shared/parser.js 默认分支）完全不受影响。
//
// 格式样例（来自导出器）：
//   第001章 标题
//
//   章节更新时间：2025-08-15 19:11
//
//   正文段落〔段评1〕
//
//   【本章段评（选摘）】
//   【段评导出说明】
//   ...
//   〔段评1〕（原始段索引：0）
//   用户名 · 点赞 535
//   评论内容
//   （跨段评论，原始段索引：35–36）
//   ［图片］https://...jpg

// 章末段评附录标题（导出器变体不同，用宽松匹配）
export const FANQIE_APPENDIX_RE = /^【本章段评[^】]*】$/;
// 部分导出器会直接从导出说明开始
export const FANQIE_EXPORT_HEAD_RE = /^【段评导出说明】$/;
// 章节更新时间行：`章节更新时间：2025-08-15 19:11`
export const FANQIE_TIME_RE = /^章节更新时间\s*[：:]\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;
// 正文里的内联段评标记：`〔段评1〕`
export const FANQIE_MARKER_RE = /〔段评(\d+)〕/g;
// 附录条目头：`〔段评1〕（原始段索引：0）`（索引可能缺失）
const FANQIE_ENTRY_RE = /^〔段评(\d+)〕(?:（原始段索引\s*[：:]\s*([^）]*)）)?/;
// 评论头：`用户名 · 点赞 535`
const COMMENT_HEAD_RE = /^(.*?)\s*·\s*点赞\s*(\d+)\s*$/;
// 跨段评论说明：`（跨段评论，原始段索引：35–36）`
const CROSS_RE = /^（跨段评论[，,]\s*原始段索引\s*[：:]\s*(\d+)\s*[–\-~]\s*(\d+)）/;
// 图片行：`［图片］https://...`
const IMAGE_RE = /^[［[]图片[］\]]\s*(\S+)\s*$/;

/**
 * 是否为番茄导出格式（以章末段评附录为特征）
 * @param {string} text
 * @returns {boolean}
 */
export function detectFanqie(text) {
  return typeof text === 'string' && /【本章段评[^】]*】/.test(text);
}

/**
 * 从文件头部解析书籍信息（书名/作者/状态/字数/简介）
 * @param {string} text
 * @returns {{name?: string, author?: string, status?: string, wordCount?: string, intro?: string}|null}
 */
export function parseFanqieMeta(text) {
  const meta = {};

  const pick = (re) => {
    const match = text.match(re);
    return match ? match[1].trim() : undefined;
  };

  const name = pick(/^书名[：:]\s*(.+)$/m);
  const author = pick(/^作者[：:]\s*(.+)$/m);
  const status = pick(/^连载状态[：:]\s*(.+)$/m);
  const wordCount = pick(/^字数[：:]\s*(.+)$/m);

  if (name) meta.name = name;
  if (author) meta.author = author;
  if (status) meta.status = status;
  if (wordCount) meta.wordCount = wordCount;

  // 简介：从【简介】下一行开始，遇到空行 / 分隔线即结束
  // 注意：简介正文本身可能以【女鬼护夫＋…】这类方括号开头，不能按【】截断
  const introIndex = text.search(/^【简介】\s*$/m);
  if (introIndex !== -1) {
    const lines = text.slice(introIndex).split('\n').slice(1);
    const introLines = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) break;
      if (/^[—\-=_]{5,}$/.test(line)) break;
      introLines.push(line);
    }
    if (introLines.length > 0) meta.intro = introLines.join('\n');
  }

  return Object.keys(meta).length > 0 ? meta : null;
}

/**
 * 移除一行正文中的内联段评标记
 * @param {string} line
 * @returns {{line: string, markers: number[]}}
 */
export function stripFanqieMarkers(line) {
  const markers = [];
  const cleaned = line.replace(FANQIE_MARKER_RE, (match, num) => {
    markers.push(Number(num));
    return '';
  });
  return { line: cleaned, markers };
}

/**
 * 解析章末段评附录
 * @param {string[]} lines - 附录原始行（不含标题行）
 * @returns {Map<number, {n: number, rawIndex: string, comments: Array}>}
 *   key 为正文标记序号 N，value.comments 为评论数组
 */
export function parseFanqieAppendix(lines) {
  const entries = new Map();
  let current = null;
  let comment = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      comment = null;
      continue;
    }

    const entryMatch = line.match(FANQIE_ENTRY_RE);
    if (entryMatch) {
      current = {
        n: Number(entryMatch[1]),
        rawIndex: (entryMatch[2] || '').trim(),
        comments: []
      };
      entries.set(current.n, current);
      comment = null;
      continue;
    }

    const headMatch = line.match(COMMENT_HEAD_RE);
    if (headMatch && current) {
      comment = {
        user: headMatch[1].trim(),
        likes: Number(headMatch[2]) || 0,
        text: '',
        images: [],
        cross: false,
        span: ''
      };
      current.comments.push(comment);
      continue;
    }

    if (!comment) continue;

    const crossMatch = line.match(CROSS_RE);
    if (crossMatch) {
      comment.cross = true;
      comment.span = `${crossMatch[1]}–${crossMatch[2]}`;
      continue;
    }

    const imageMatch = line.match(IMAGE_RE);
    if (imageMatch && /^https?:\/\//i.test(imageMatch[1])) {
      comment.images.push(imageMatch[1]);
      continue;
    }

    comment.text = comment.text ? `${comment.text}\n${line}` : line;
  }

  return entries;
}
