// Popup 逻辑

const STORAGE_KEYS = {
  BOOKS: 'books',
  SETTINGS: 'settings',
  BOOKMARKS: 'bookmarks'
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
const CHAPTER_REGEX = /\n第[一二三四五六七八九十百千万1234567890]+[章节].*\n/;

function parseChapters(text) {
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

function detectEncoding(arrayBuffer) {
  const uint8 = new Uint8Array(arrayBuffer);

  if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    return 'UTF-8';
  }
  if (uint8.length >= 2) {
    if (uint8[0] === 0xFF && uint8[1] === 0xFE) return 'UTF-16LE';
    if (uint8[0] === 0xFE && uint8[1] === 0xFF) return 'UTF-16BE';
  }

  const sample = arrayBuffer.slice(0, 50000);
  const text = new TextDecoder('UTF-8').decode(sample);
  if (!text.includes('') && (countChinese(text) / text.length > 0.1 || text.length < 100)) {
    return 'UTF-8';
  }

  const textGBK = new TextDecoder('GBK').decode(sample);
  if (countChinese(textGBK) / textGBK.length > 0.3) return 'GBK';

  const textGB18030 = new TextDecoder('GB18030').decode(sample);
  if (countChinese(textGB18030) / textGB18030.length > 0.3) return 'GB18030';

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