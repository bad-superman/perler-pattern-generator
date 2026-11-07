export class AccessError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'AccessError'
    this.code = code
    this.status = status
  }
}

export const ACCESS_ERRORS = {
  invalid: () => new AccessError('INVALID_ACCESS_TOKEN', '专属链接无效', 401),
  disabled: () => new AccessError('ACCESS_DISABLED', '专属链接已停用', 403),
  expired: () => new AccessError('ACCESS_EXPIRED', '专属链接已过期', 410),
  exhausted: () => new AccessError('CREDITS_EXHAUSTED', '当前专属链接的生成次数已用完', 402),
  duplicate: () => new AccessError('REQUEST_ALREADY_SUCCEEDED', '该生成请求已经成功处理', 409),
  processing: () => new AccessError('REQUEST_IN_PROGRESS', '生成请求正在处理中', 409),
}
