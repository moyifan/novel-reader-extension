// Service Worker for Novel Reader Chrome Extension

import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants.js';

let migrationPromise = null;

function getMetaKey(bookId) {
  return `${STORAGE_KEYS.BOOK_META_PREFIX}${bookId}`;
}

function getContentKey(bookId) {
  return `${STORAGE_KEYS.BOOK_CONTENT_PREFIX}${bookId}`;
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.set(payload, resolve);
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

function splitBookData(book) {
  if (!book) return { meta: null, content: null };
  const { chapters = [], ...metaFields } = book;
  const meta = {
    ...metaFields,
    totalChapters: metaFields.totalChapters || chapters.length
  };
  return { meta, content: chapters };
}

async function ensureStorageMigrated() {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const data = await storageGet([STORAGE_KEYS.BOOKS, STORAGE_KEYS.BOOK_INDEX]);
    const legacyBooks = data[STORAGE_KEYS.BOOKS];
    const existingIndex = data[STORAGE_KEYS.BOOK_INDEX];

    // 仅在存在旧结构，且新结构索引还未初始化完成时迁移
    if (!Array.isArray(legacyBooks) || legacyBooks.length === 0) {
      return;
    }
    if (Array.isArray(existingIndex) && existingIndex.length > 0) {
      return;
    }

    const index = [];
    const payload = {};

    for (const book of legacyBooks) {
      if (!book || !book.id) continue;
      const { meta, content } = splitBookData(book);
      if (!meta) continue;
      index.push(book.id);
      payload[getMetaKey(book.id)] = meta;
      payload[getContentKey(book.id)] = content;
    }

    payload[STORAGE_KEYS.BOOK_INDEX] = index;
    await storageSet(payload);
    await storageRemove(STORAGE_KEYS.BOOKS);
  })();

  return migrationPromise;
}

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = (handler) => {
    ensureStorageMigrated()
      .then(handler)
      .catch((error) => sendResponse({ error: error?.message || 'Internal error' }));
  };

  const handlers = {
    GET_BOOKS: () => run(() => getBooks().then(sendResponse)),
    GET_BOOK: () => run(() => getBook(message.bookId).then(sendResponse)),
    SAVE_BOOK: () => run(() => saveBook(message.book).then(() => sendResponse({ success: true }))),
    DELETE_BOOK: () => run(() => deleteBook(message.bookId).then(() => sendResponse({ success: true }))),
    UPDATE_PROGRESS: () => run(() => updateReadingProgress(message.bookId, message.chapterIndex, message.scrollPercent).then(() => sendResponse({ success: true }))),
    GET_SETTINGS: () => getSettings().then(sendResponse),
    SAVE_SETTINGS: () => saveSettings(message.settings).then(() => sendResponse({ success: true }))
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
  ensureStorageMigrated().catch(() => {});
});

async function getBooks() {
  const data = await storageGet(STORAGE_KEYS.BOOK_INDEX);
  const bookIndex = Array.isArray(data[STORAGE_KEYS.BOOK_INDEX]) ? data[STORAGE_KEYS.BOOK_INDEX] : [];

  if (bookIndex.length === 0) return [];

  const metaKeys = bookIndex.map((id) => getMetaKey(id));
  const metaData = await storageGet(metaKeys);
  const books = bookIndex
    .map((id) => metaData[getMetaKey(id)])
    .filter(Boolean)
    .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));

  return books;
}

async function getBook(bookId) {
  if (!bookId) return null;

  const [metaData, contentData] = await Promise.all([
    storageGet(getMetaKey(bookId)),
    storageGet(getContentKey(bookId))
  ]);

  const meta = metaData[getMetaKey(bookId)];
  const chapters = contentData[getContentKey(bookId)];
  if (!meta) return null;

  return { ...meta, chapters: Array.isArray(chapters) ? chapters : [] };
}

async function saveBook(book) {
  if (!book || !book.id) return;

  const { meta, content } = splitBookData(book);
  const indexData = await storageGet(STORAGE_KEYS.BOOK_INDEX);
  const bookIndex = Array.isArray(indexData[STORAGE_KEYS.BOOK_INDEX]) ? indexData[STORAGE_KEYS.BOOK_INDEX] : [];
  const exists = bookIndex.includes(book.id);
  const nextIndex = exists ? bookIndex : [...bookIndex, book.id];

  await storageSet({
    [STORAGE_KEYS.BOOK_INDEX]: nextIndex,
    [getMetaKey(book.id)]: meta,
    [getContentKey(book.id)]: content
  });
}

async function deleteBook(bookId) {
  if (!bookId) return;

  const indexData = await storageGet(STORAGE_KEYS.BOOK_INDEX);
  const bookIndex = Array.isArray(indexData[STORAGE_KEYS.BOOK_INDEX]) ? indexData[STORAGE_KEYS.BOOK_INDEX] : [];
  const nextIndex = bookIndex.filter((id) => id !== bookId);

  await storageSet({ [STORAGE_KEYS.BOOK_INDEX]: nextIndex });
  await storageRemove([getMetaKey(bookId), getContentKey(bookId)]);
}

async function updateReadingProgress(bookId, chapterIndex, scrollPercent) {
  if (!bookId) return;

  const metaKey = getMetaKey(bookId);
  const data = await storageGet(metaKey);
  const meta = data[metaKey];
  if (!meta) return;

  await storageSet({
    [metaKey]: {
      ...meta,
      lastChapterIndex: chapterIndex,
      lastScrollPercent: scrollPercent,
      lastReadAt: Date.now()
    }
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
