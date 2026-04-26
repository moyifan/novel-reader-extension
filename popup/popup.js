// Popup 逻辑

const STORAGE_KEYS = {
  BOOKS: 'books',
  SETTINGS: 'settings'
};

// DOM 元素
const bookList = document.getElementById('bookList');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const settingsLink = document.getElementById('settingsLink');
const confirmDialog = document.getElementById('confirmDialog');
const cancelDeleteBtn = document.getElementById('cancelDelete');
const confirmDeleteBtn = document.getElementById('confirmDelete');

let books = [];
let deleteTargetBookId = null;

// 加载书籍列表
async function loadBooks() {
  try {
    books = await getBooks();
  } catch (e) {
    console.error('loadBooks error:', e);
  }
  renderBookList();
}

// 渲染书籍列表
function renderBookList() {
  if (books.length === 0) {
    bookList.innerHTML = '<div class="book-empty">暂无书籍，点击下方按钮上传</div>';
    return;
  }

  bookList.innerHTML = books.map(book => `
    <div class="book-item" data-book-id="${book.id}">
      <span class="book-name">${escapeHtml(book.name)}</span>
      <span class="book-meta">${(book.lastChapterIndex || 0) + 1}/${book.totalChapters || '?'}</span>
      <button class="delete-btn" data-delete-id="${book.id}">删除</button>
    </div>
  `).join('');

  bookList.querySelectorAll('.book-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn')) {
        openReader(item.dataset.bookId);
      }
    });
  });

  bookList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTargetBookId = btn.dataset.deleteId;
      confirmDialog.classList.add('show');
    });
  });
}

function openReader(bookId) {
  const url = chrome.runtime.getURL(`pages/reader.html?bookId=${bookId}`);
  console.log('Opening reader:', url);
  chrome.tabs.create({ url });
}

// 文件上传

// 章节正则 - 匹配原脚本格式
// 数字: 0-9 半角 + ０-９ 全角 + 中文数字(简繁)
// 章节单位: 章/回/卷/节/折/篇/幕/集/話
// 注意: 末尾的 [^\n]* 用于捕获章节名
const CHAPTER_REGEX_LIST = [
  /^第?\s*[0-9０-９〇一二两三四五六七八九十○零百千万亿兩]{1,6}\s*[章节回卷节折篇幕集话話][^\n]*/im,
];

// 章节关键字列表
const CHAPTER_KEYWORDS = ['章', '回', '卷', '节', '折', '篇', '幕', '集', '話'];

/**
 * 检查是否是真正的章节标题行
 * 排除"一回生"等误匹配
 * 但允许"第1章 性偶"这种章节名
 */
function isRealChapterTitle(line, matchedPart) {
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

  // 如果章节关键字后紧跟中文字（没有空格分隔），是误匹配
  if (afterKeyword.length > 0 && afterKeyword[0] !== ' ' && /[一-龥]/.test(afterKeyword[0])) {
    return false;
  }

  return true;
}

function parseChapters(text) {
  const chapters = [];
  const lines = text.split('\n');

  let currentChapter = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 检查是否是章节标题
    let isChapterTitle = false;
    let matchedTitle = null;

    for (const regex of CHAPTER_REGEX_LIST) {
      const match = trimmedLine.match(regex);
      if (match) {
        matchedTitle = match[0].replace(/^\n/, '').trim();
        // 检查是否是真正的章节标题
        if (isRealChapterTitle(trimmedLine, match[0])) {
          isChapterTitle = true;
          break;
        }
      }
    }

    if (isChapterTitle) {
      // 保存上一个章节
      if (currentChapter !== null) {
        const content = currentContent.join('\n').trim();
        if (content.length > 0) {
          chapters.push({
            title: currentChapter,
            content: content
          });
        }
      }

      // 确定章节标题
      let chapterTitle = matchedTitle || trimmedLine;

      // 如果 matchedTitle 只是 "第X章"（章节关键字后没有内容），检查下一行是否是短文本（章节名）
      let hasChapterName = false;
      for (const kw of CHAPTER_KEYWORDS) {
        if (matchedTitle && matchedTitle.endsWith(kw)) {
          hasChapterName = true;
          break;
        }
      }

      // 如果 matchedTitle 只是 "第X章" 或 "第X回" 等，检查下一行
      if (hasChapterName && matchedTitle === trimmedLine) {
        const nextLine = lines[i + 1]?.trim();
        // 如果下一行存在且较短（少于15字符），可能是章节名
        if (nextLine && nextLine.length > 0 && nextLine.length < 15 && !/^第/.test(nextLine)) {
          chapterTitle = matchedTitle + ' ' + nextLine;
          // 跳过下一行（它已经被用作章节名了）
          i++;
        }
      }

      // 开始新章节
      currentChapter = chapterTitle;
      currentContent = [];
    } else {
      // 内容行
      if (currentChapter !== null) {
        currentContent.push(line);
      }
    }
  }

  // 保存最后一个章节
  if (currentChapter !== null) {
    const content = currentContent.join('\n').trim();
    if (content.length > 0) {
      chapters.push({
        title: currentChapter,
        content: content
      });
    }
  }

  // 如果没有找到章节，整篇小说作为一章
  if (chapters.length === 0) {
    chapters.push({
      title: '前言',
      content: text.trim()
    });
  }

  return chapters;
}

function detectEncoding(arrayBuffer) {
  const uint8 = new Uint8Array(arrayBuffer);

  // 检查 BOM
  if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    return 'UTF-8';
  }
  if (uint8.length >= 2) {
    if (uint8[0] === 0xFF && uint8[1] === 0xFE) return 'UTF-16LE';
    if (uint8[0] === 0xFE && uint8[1] === 0xFF) return 'UTF-16BE';
  }

  const sampleSize = Math.min(100000, arrayBuffer.byteLength);
  const sample = arrayBuffer.slice(0, sampleSize);

  // 尝试 UTF-8 并检测是否有替换字符（乱码特征）
  const textUTF8 = new TextDecoder('UTF-8').decode(sample);
  const utf8ReplacementCount = (textUTF8.match(/�/g) || []).length;
  const chineseCountUTF8 = countChinese(textUTF8);

  // 如果 UTF-8 替换字符很少或中文字符比例合理，认为是 UTF-8
  if (utf8ReplacementCount < 10 && (chineseCountUTF8 / textUTF8.length > 0.05 || textUTF8.length < 1000)) {
    return 'UTF-8';
  }

  // 尝试 GBK
  const textGBK = new TextDecoder('GBK').decode(sample);
  const chineseCountGBK = countChinese(textGBK);
  if (chineseCountGBK / textGBK.length > 0.2) {
    return 'GBK';
  }

  // 尝试 GB18030
  const textGB18030 = new TextDecoder('GB18030').decode(sample);
  const chineseCountGB18030 = countChinese(textGB18030);
  if (chineseCountGB18030 / textGB18030.length > 0.2) {
    return 'GB18030';
  }

  // 默认返回 UTF-8
  return 'UTF-8';
}

function countChinese(text) {
  const matches = text.match(/[一-龥]/g);
  return matches ? matches.length : 0;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  console.log('File selected:', file.name);

  try {
    const arrayBuffer = await file.arrayBuffer();
    console.log('ArrayBuffer read, size:', arrayBuffer.byteLength);

    const encoding = detectEncoding(arrayBuffer);
    console.log('Detected encoding:', encoding);

    const text = new TextDecoder(encoding).decode(arrayBuffer);
    console.log('Text decoded, length:', text.length);

    const chapters = parseChapters(text);
    console.log('Chapters parsed:', chapters.length);

    const book = {
      id: file.name + '_' + generateId(),
      name: file.name.replace(/\.txt$/i, ''),
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      lastChapterIndex: 0,
      lastScrollPercent: 0,
      totalChapters: chapters.length,
      encoding,
      chapters
    };

    console.log('Book object created, id:', book.id);

    await saveBook(book);
    console.log('Book saved to storage');

    await loadBooks();
    console.log('Books reloaded');

    openReader(book.id);
    console.log('Reader opened');
  } catch (error) {
    console.error('Error processing file:', error);
    alert('读取文件失败: ' + error.message);
  }

  fileInput.value = '';
});

settingsLink.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
});

cancelDeleteBtn.addEventListener('click', () => {
  confirmDialog.classList.remove('show');
  deleteTargetBookId = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
  if (deleteTargetBookId) {
    await deleteBook(deleteTargetBookId);
    await loadBooks();
  }
  confirmDialog.classList.remove('show');
  deleteTargetBookId = null;
});

// Storage API wrappers
function getBooks() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_BOOKS' }, (result) => {
      console.log('GET_BOOKS result:', result);
      resolve(result || []);
    });
  });
}

function saveBook(book) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'SAVE_BOOK', book }, (result) => {
      console.log('SAVE_BOOK result:', result);
      resolve(result);
    });
  });
}

function deleteBook(bookId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'DELETE_BOOK', bookId }, resolve);
  });
}

loadBooks();