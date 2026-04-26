// 章节解析模块 - 复用 Flask 的正则

import { CHAPTER_REGEX } from './constants.js';
import { escapeHtml, generateId } from './utils.js';

/**
 * 解析章节
 * @param {string} text - 完整小说文本
 * @returns {Array<{title: string, content: string}>} 章节列表
 */
export function parseChapters(text) {
  const parts = text.split(CHAPTER_REGEX);
  const chapters = [];

  const preface = parts[0]?.trim();
  if (preface && preface.length > 10) {
    chapters.push({ title: '前言', content: preface });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const rawTitle = parts[i] || '';
    const content = parts[i + 1]?.trim() || '';
    const title = rawTitle.replace(/\n/g, '').trim() || `第${Math.ceil(i / 2)}章`;

    if (content.length > 0) {
      chapters.push({ title, content });
    }
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
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
}

/**
 * 生成书籍 ID
 * @param {string} name - 书名
 * @returns {string} 书籍ID
 */
export function generateBookId(name) {
  return `${name}_${generateId()}`;
}