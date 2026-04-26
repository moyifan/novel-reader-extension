// 编码检测模块

/**
 * 检测文件编码
 * @param {ArrayBuffer} arrayBuffer - 文件内容
 * @returns {string} 检测到的编码名称
 */
export function detectEncoding(arrayBuffer) {
  const uint8 = new Uint8Array(arrayBuffer);

  // 检查 BOM
  if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    return 'UTF-8';
  }
  if (uint8.length >= 2) {
    if (uint8[0] === 0xFF && uint8[1] === 0xFE) return 'UTF-16LE';
    if (uint8[0] === 0xFE && uint8[1] === 0xFF) return 'UTF-16BE';
  }

  // 预切片避免重复分配
  const sample = arrayBuffer.slice(0, 50000);
  const validRatio = countValidChineseChars;

  // 尝试 UTF-8
  const text = new TextDecoder('UTF-8').decode(sample);
  if (!text.includes('') && (validRatio(text) / text.length > 0.1 || text.length < 100)) {
    return 'UTF-8';
  }

  // 尝试 GBK
  const textGBK = new TextDecoder('GBK').decode(sample);
  if (validRatio(textGBK) / textGBK.length > 0.3) return 'GBK';

  // 尝试 GB18030
  const textGB18030 = new TextDecoder('GB18030').decode(sample);
  if (validRatio(textGB18030) / textGB18030.length > 0.3) return 'GB18030';

  return 'UTF-8';
}

function countValidChineseChars(text) {
  const matches = text.match(/[一-龥]/g);
  return matches ? matches.length : 0;
}

/**
 * 解码文件内容
 * @param {ArrayBuffer} arrayBuffer - 文件内容
 * @param {string} encoding - 编码名称
 * @returns {string} 解码后的文本
 */
export function decodeText(arrayBuffer, encoding = 'UTF-8') {
  return new TextDecoder(encoding).decode(arrayBuffer);
}