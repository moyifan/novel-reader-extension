// Storage wrapper for chrome.storage API

import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants.js';
import { generateId } from './utils.js';

export { generateId };

export async function getBooks() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_BOOKS' }, resolve));
}

export async function getBook(bookId) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_BOOK', bookId }, resolve));
}

export async function saveBook(book) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'SAVE_BOOK', book }, resolve));
}

export async function deleteBook(bookId) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'DELETE_BOOK', bookId }, resolve));
}

export async function updateProgress(bookId, chapterIndex, scrollPercent) {
  return new Promise((resolve) => chrome.runtime.sendMessage({
    type: 'UPDATE_PROGRESS', bookId, chapterIndex, scrollPercent
  }, resolve));
}

/**
 * 批量读取章节段评
 * @param {string} bookId
 * @param {number[]} chapterIndices
 * @returns {Promise<Object<number, object>>} 章节下标 -> 段评数据
 */
export async function getBookNotes(bookId, chapterIndices) {
  return new Promise((resolve) => chrome.runtime.sendMessage({
    type: 'GET_BOOK_NOTES', bookId, chapterIndices
  }, resolve));
}

export async function getSettings() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve));
}

export async function saveSettings(settings) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, resolve));
}

