// Popup 逻辑

import { escapeHtml, generateId } from '../shared/utils.js';
import { detectEncoding } from '../shared/encoding.js';
import { getBooks, saveBook, deleteBook } from '../shared/storage.js';
import { parseChapters } from '../shared/parser.js';

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
      id: generateId() + '_' + file.name.replace(/\.txt$/i, '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_'),
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

loadBooks();
