// Service Worker for Novel Reader Chrome Extension

const STORAGE_KEYS = {
  BOOKS: 'books',
  SETTINGS: 'settings',
  BOOKMARKS: 'bookmarks'
};

const DEFAULT_SETTINGS = {
  theme: 'eye-care',
  fontSize: 18,
  fontFamily: 'Source Han Serif SC',
  lineHeight: 1.8,
  pageFlip: 'none',
  autoScroll: false,
  autoScrollSpeed: 30
};

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    GET_BOOKS: () => getBooks().then(sendResponse),
    GET_BOOK: () => getBook(message.bookId).then(sendResponse),
    SAVE_BOOK: () => saveBook(message.book).then(() => sendResponse({ success: true })),
    DELETE_BOOK: () => deleteBook(message.bookId).then(() => sendResponse({ success: true })),
    UPDATE_PROGRESS: () => updateReadingProgress(message.bookId, message.chapterIndex, message.scrollPercent).then(() => sendResponse({ success: true })),
    GET_SETTINGS: () => getSettings().then(sendResponse),
    SAVE_SETTINGS: () => saveSettings(message.settings).then(() => sendResponse({ success: true })),
    GET_BOOKMARKS: () => getBookmarks(message.bookId).then(sendResponse),
    ADD_BOOKMARK: () => addBookmark(message.bookmark).then(() => sendResponse({ success: true })),
    DELETE_BOOKMARK: () => deleteBookmark(message.bookmarkId).then(() => sendResponse({ success: true }))
  };

  if (handlers[message.type]) {
    handlers[message.type]();
    return true;
  }
  sendResponse({ error: 'Unknown message type' });
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (data) => {
    if (!data[STORAGE_KEYS.SETTINGS]) {
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
    }
  });
});

async function getBooks() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKS, (data) => {
      const books = (data[STORAGE_KEYS.BOOKS] || []).sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
      resolve(books);
    });
  });
}

async function getBook(bookId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKS, (data) => {
      const books = data[STORAGE_KEYS.BOOKS] || [];
      resolve(books.find(b => b.id === bookId) || null);
    });
  });
}

async function saveBook(book) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKS, (data) => {
      let books = data[STORAGE_KEYS.BOOKS] || [];
      const idx = books.findIndex(b => b.id === book.id);
      if (idx >= 0) books[idx] = { ...books[idx], ...book };
      else books.push(book);
      chrome.storage.local.set({ [STORAGE_KEYS.BOOKS]: books }, resolve);
    });
  });
}

async function deleteBook(bookId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKS, (data) => {
      const books = (data[STORAGE_KEYS.BOOKS] || []).filter(b => b.id !== bookId);
      chrome.storage.local.set({ [STORAGE_KEYS.BOOKS]: books }, resolve);
    });
  });
}

async function updateReadingProgress(bookId, chapterIndex, scrollPercent) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKS, (data) => {
      let books = data[STORAGE_KEYS.BOOKS] || [];
      const idx = books.findIndex(b => b.id === bookId);
      if (idx >= 0) {
        books[idx].lastChapterIndex = chapterIndex;
        books[idx].lastScrollPercent = scrollPercent;
        books[idx].lastReadAt = Date.now();
      }
      chrome.storage.local.set({ [STORAGE_KEYS.BOOKS]: books }, resolve);
    });
  });
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (data) => {
      resolve(data[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS);
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, resolve);
  });
}

async function getBookmarks(bookId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS, (data) => {
      resolve((data[STORAGE_KEYS.BOOKMARKS] || []).filter(b => b.bookId === bookId));
    });
  });
}

async function addBookmark(bookmark) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS, (data) => {
      const bookmarks = (data[STORAGE_KEYS.BOOKMARKS] || []);
      bookmarks.push(bookmark);
      chrome.storage.local.set({ [STORAGE_KEYS.BOOKMARKS]: bookmarks }, resolve);
    });
  });
}

async function deleteBookmark(bookmarkId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS, (data) => {
      const bookmarks = (data[STORAGE_KEYS.BOOKMARKS] || []).filter(b => b.id !== bookmarkId);
      chrome.storage.local.set({ [STORAGE_KEYS.BOOKMARKS]: bookmarks }, resolve);
    });
  });
}