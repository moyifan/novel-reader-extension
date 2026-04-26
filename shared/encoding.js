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
  const sample = arrayBuffer.slice(0, 100000);

  // 尝试 UTF-8 并检测是否有替换字符（乱码特征）
  const textUTF8 = new TextDecoder('UTF-8').decode(sample);
  const utf8ReplacementCount = (textUTF8.match(/�/g) || []).length;
  const chineseCountUTF8 = countValidChineseChars(textUTF8);

  // 如果 UTF-8 替换字符很少且中文字符比例合理，认为是 UTF-8
  if (utf8ReplacementCount < 10 && (chineseCountUTF8 / textUTF8.length > 0.05 || textUTF8.length < 1000)) {
    return 'UTF-8';
  }

  // 尝试 GBK
  const textGBK = new TextDecoder('GBK').decode(sample);
  const chineseCountGBK = countValidChineseChars(textGBK);
  if (chineseCountGBK / textGBK.length > 0.2) {
    return 'GBK';
  }

  // 尝试 GB18030
  const textGB18030 = new TextDecoder('GB18030').decode(sample);
  const chineseCountGB18030 = countValidChineseChars(textGB18030);
  if (chineseCountGB18030 / textGB18030.length > 0.2) {
    return 'GB18030';
  }

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