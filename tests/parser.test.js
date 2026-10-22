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

run('带 emoji 装饰前缀的标题能识别', () => {
  const text = [
    '第274章 灵族的父神？',
    '内容A',
    '🍎 第275章 基石序列的新标准',
    '内容B',
    '🍎 第276章 帝国暗面的新格局',
    '内容C'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 3);
  // 前缀被剥离，标题干净
  assert.equal(chapters[1].title, '第275章 基石序列的新标准');
  assert.equal(chapters[2].title, '第276章 帝国暗面的新格局');
  // 第275章的内容归属正确，不会并进第274章
  assert.ok(chapters[0].content.includes('内容A'));
  assert.ok(!chapters[0].content.includes('基石序列的新标准'));
  assert.ok(chapters[1].content.includes('内容B'));
});

run('章后无空格的阿拉伯数字标题能识别', () => {
  const text = [
    '第99章 倒霉的星球',
    '内容A',
    '第100章借纳垢的刀，收奸奇的菜',
    '内容B',
    '第101章 两万死士硬顶',
    '内容C'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 3);
  assert.equal(chapters[1].title, '第100章借纳垢的刀，收奸奇的菜');
  assert.ok(chapters[1].content.includes('内容B'));
});

run('正文里的回/节/章干扰词不会被当成标题', () => {
  const text = [
    '第200章 群贤汇聚',
    '第七回廊的低语收藏者。',
    '第三节太重。你们人类的舌头总像被钢钉钉住。',
    '第3回合结束，战斗继续。',
    '第201章 熊卫升级',
    '内容C'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '第200章 群贤汇聚');
  assert.equal(chapters[1].title, '第201章 熊卫升级');
  assert.ok(chapters[0].content.includes('第七回廊'));
  assert.ok(chapters[0].content.includes('第3回合结束'));
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

run('正文以「二话不说」开头不会被切成章节', () => {
  const text = [
    '第221章 终局',
    '二话不说，直接掀了灵堂的棺盖。',
    '二话不说就勾引着所有怨魂朝我跑来。',
    '第222章 继续',
    '正文二'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '第221章 终局');
  assert.equal(chapters[1].title, '第222章 继续');
  assert.ok(chapters[0].content.includes('二话不说，直接掀了灵堂的棺盖。'));
});

run('简体「第N话」仍能识别为章节', () => {
  const text = [
    '第1话 起始',
    '内容一',
    '第2话 继续',
    '内容二'
  ].join('\n');

  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '第1话 起始');
  assert.equal(chapters[1].title, '第2话 继续');
});
