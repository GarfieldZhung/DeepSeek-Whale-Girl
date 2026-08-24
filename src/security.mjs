export function sanitizePrompt(value, maxLength = 1200) {
  const text = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (!text) throw new Error('先写下想问小鲸鱼的问题吧')
  if (text.length > maxLength) throw new Error(`问题不能超过 ${maxLength} 个字符`)
  return text
}

export function sanitizeModelText(value, maxLength = 2400) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\/?(?:script|iframe|object|embed)[^>]*>/gi, '')
    .trim()
    .slice(0, maxLength)
}
