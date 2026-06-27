import assert from 'node:assert/strict';
import { parseChapters } from '../shared/parser.js';

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

run('能解析基础章节结构', () => {
  const text = [
    '第1章 起始',
    '内容A1',
    '内容A2',
    '第2章 继续',
    '内容B'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '第1章 起始');
  assert.equal(chapters[1].title, '第2章 继续');
    assert.ok(chapters[0].content.includes('内容A1'));
  // 章节标题不含前导 em-space
  assert.equal(chapters[0].title.indexOf('\u2003'), -1, 'chapter title should have no em-space');
});

run('误匹配场景一回生不会被识别为章节', () => {
  const text = [
    '一回生，二回熟。',
    '这是一段正文',
    '第3章 正式章节',
    '这里是第三章内容'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, '第3章 正式章节');
});

run('第X章后短标题会拼接到章节名', () => {
  const text = [
    '第12章',
    '风起云涌',
    '正文第一段',
    '第13章',
    '终章',
    '正文第二段'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '第12章 风起云涌');
  assert.equal(chapters[1].title, '第13章 终章');
});

run('无章节标题时整篇回退为前言', () => {
  const text = ['这是没有章节头的文本', '第二段'].join('\n');
  const chapters = parseChapters(text);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, '前言');
  assert.ok(chapters[0].content.includes('第二段'));
});

run('支持全角数字与繁体話关键字', () => {
  const text = [
    '第１２話 相逢',
    '內容一',
    '第１３話 再會',
    '內容二'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '第１２話 相逢');
  assert.equal(chapters[1].title, '第１３話 再會');
});

run('前导 em-space 不干扰章节识别', () => {
  const text = [
    '\u2003第1章 起始',
    '\u2003\u2003内容A1',
    '\u2003\u2003内容A2',
    '第2章 继续',
    '\u2003\u2003内容B'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '第1章 起始');
  assert.equal(chapters[1].title, '第2章 继续');
  // .trim() 会清除首尾的 em-space，splitToParagraphs 逐行 .trim() 清除全部前导空白
    assert.ok(chapters[0].content.includes('内容A1'));
  // 章节标题不含前导 em-space
  assert.equal(chapters[0].title.indexOf('\u2003'), -1, 'chapter title should have no em-space');
  // 章节标题不含 em-space
  assert.equal(chapters[0].title.indexOf('\u2003'), -1, 'chapter title should have no em-space');
});

run('前导全角空格不干扰章节识别', () => {
  const text = [
    '\u3000第5章 新的开始',
    '\u3000\u3000「正文内容」'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, '第5章 新的开始');
  assert.ok(chapters[0].content.includes('「正文内容」'));
});
