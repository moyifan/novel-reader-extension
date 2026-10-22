import assert from 'node:assert/strict';
import { parseChapters, parseNovel } from '../shared/parser.js';

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

// 番茄导出格式样本：书籍信息头 + 内联段评标记 + 章末段评附录
const FANQIE_SAMPLE = [
  '书籍信息',
  '',
  '书名：测试书',
  '作者：测试作者',
  '连载状态：已完结',
  '字数：1.2 万字',
  '',
  '【简介】',
  '　　【女鬼护夫】第一段简介',
  '　　第二段简介',
  '',
  '【评分刚出，后面会涨】',
  '',
  '————————————————',
  '',
  '第001章 开局',
  '',
  '章节更新时间：2025-08-15 19:11',
  '',
  '第一段正文〔段评1〕',
  '',
  '第二段正文……〔段评2〕',
  '',
  '【本章段评（选摘）】',
  '【段评导出说明】',
  '收录范围：每章按正文顺序最多前 30 个有评段落，每段仅热门前 5 条；不含回复和头像。',
  '',
  '〔段评1〕（原始段索引：0）',
  '读者A · 点赞 3',
  '好看',
  '',
  '读者B · 点赞 12',
  '牛逼',
  '',
  '〔段评2〕（原始段索引：1）',
  '读者C · 点赞 1',
  '［图片］https://example.com/x.jpg',
  '（跨段评论，原始段索引：1–2）',
  '跨段内容',
  '',
  '第002章 继续',
  '',
  '章节更新时间：2025-08-16 10:00',
  '',
  '正文二'
].join('\n');

run('番茄格式：识别、清洗与段评解析', () => {
  const result = parseNovel(FANQIE_SAMPLE);

  assert.equal(result.format, 'fanqie');
  assert.equal(result.meta.name, '测试书');
  assert.equal(result.meta.author, '测试作者');
  assert.equal(result.meta.status, '已完结');
  assert.equal(result.meta.wordCount, '1.2 万字');
  assert.equal(result.meta.intro, '【女鬼护夫】第一段简介\n第二段简介');

  assert.equal(result.chapters.length, 2);
  const [chapter, second] = result.chapters;

  assert.equal(chapter.title, '第001章 开局');
  assert.equal(chapter.content, '第一段正文\n\n第二段正文……');
  for (const noise of ['章节更新时间', '〔段评', '【本章段评', '段评导出说明', '读者A']) {
    assert.ok(!chapter.content.includes(noise), `正文不应包含导出噪音：${noise}`);
  }

  assert.ok(chapter.notes, '第一章应解析出段评');
  assert.equal(chapter.notes.total, 3);
  assert.equal(chapter.notes.spans.length, 2);

  const firstSpan = chapter.notes.spans[0];
  assert.equal(firstSpan.para, 0);
  // 按点赞数降序
  assert.deepEqual(firstSpan.comments.map(c => c.likes), [12, 3]);

  const secondSpan = chapter.notes.spans[1];
  assert.equal(secondSpan.para, 1);
  const crossComment = secondSpan.comments[0];
  assert.equal(crossComment.user, '读者C');
  assert.equal(crossComment.cross, true);
  assert.equal(crossComment.span, '1–2');
  assert.deepEqual(crossComment.images, ['https://example.com/x.jpg']);
  assert.equal(crossComment.text, '跨段内容');

  // 第二章无段评
  assert.equal(second.content, '正文二');
  assert.equal(second.notes, undefined);
});

run('非番茄格式完全不受影响', () => {
  const plain = [
    '第1章 开始',
    '章节更新时间：2025-01-01 00:00',
    '正文〔段评1〕'
  ].join('\n');

  const result = parseNovel(plain);
  assert.equal(result.format, null);
  assert.equal(result.meta, null);
  // 与直接调用 parseChapters 完全一致（不清洗、不改动任何行）
  assert.deepEqual(result.chapters, parseChapters(plain));
  assert.equal(result.chapters[0].content, '章节更新时间：2025-01-01 00:00\n正文〔段评1〕');
});

run('附录里的「第N章」评论不会被误切成章节', () => {
  const text = [
    '第001章 开局',
    '',
    '章节更新时间：2025-08-15 19:11',
    '',
    '正文〔段评1〕',
    '',
    '【本章段评（选摘）】',
    '',
    '〔段评1〕（原始段索引：0）',
    '读者A · 点赞 3',
    '第002章 快更',
    '催更催更'
  ].join('\n');

  const result = parseNovel(text);
  assert.equal(result.format, 'fanqie');
  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].notes.spans[0].comments[0].text, '第002章 快更\n催更催更');
});

run('无法定位的段评进入 orphans', () => {
  const text = [
    '第001章 开局',
    '',
    '章节更新时间：2025-08-15 19:11',
    '',
    '正文〔段评1〕',
    '',
    '【本章段评（选摘）】',
    '',
    '〔段评1〕（原始段索引：0）',
    '读者A · 点赞 3',
    '正常段评',
    '',
    '〔段评2〕（原始段索引：99）',
    '读者B · 点赞 1',
    '找不到段落'
  ].join('\n');

  const result = parseNovel(text);
  const notes = result.chapters[0].notes;
  assert.equal(notes.total, 2);
  assert.equal(notes.spans.length, 1);
  assert.equal(notes.orphans.length, 1);
  assert.equal(notes.orphans[0].rawIndex, '99');
  assert.equal(notes.orphans[0].comments[0].user, '读者B');
});

run('番茄格式也兼容无三段评的章节', () => {
  const text = [
    '第001章 开局',
    '',
    '正文一',
    '',
    '第002章 无评',
    '',
    '正文二'
  ].join('\n');

  // 需要附录特征才判定为番茄格式，这里补一个附录标题保证识别
  const withFeature = text + '\n\n【本章段评（选摘）】\n';
  const result = parseNovel(withFeature);
  assert.equal(result.format, 'fanqie');
  assert.equal(result.chapters[0].content, '正文一');
  assert.equal(result.chapters[1].content, '正文二');
  assert.equal(result.chapters[0].notes, undefined);
});
