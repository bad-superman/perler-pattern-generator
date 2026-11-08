export interface AccessPassSummary {
  id: string
  label: string
  totalCredits: number
  remainingCredits: number
  availableCredits: number
  reservedCredits: number
  status: 'active' | 'disabled'
  expiresAt: number | null
  createdAt: number
  updatedAt: number
  expired: boolean
}

export interface AccessPassDetail {
  pass: AccessPassSummary
  jobs: Array<{ id: string; status: string; creditState: string; provider: string | null; model: string | null; errorMessage: string | null; createdAt: number }>
  ledger: Array<{ id: string; delta: number; balance_after: number; reason: string; created_at: number }>
}

export class AccessClientError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'AccessClientError'
    this.code = code
    this.status = status
  }
}

export class AccessNetworkError extends Error {
  constructor(message = '网络连接异常，请检查网络后重试') {
    super(message)
    this.name = 'AccessNetworkError'
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { code?: string; error?: string }
  if (!response.ok) throw new AccessClientError(body.error || '请求失败', body.code || 'REQUEST_FAILED', response.status)
  return body
}

export async function verifyAccessToken(token: string): Promise<AccessPassSummary> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      })
      const body = await readResponse<{ pass: AccessPassSummary }>(response)
      return body.pass
    } catch (cause) {
      if (cause instanceof AccessClientError) throw cause
      lastError = cause
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 500))
    } finally {
      window.clearTimeout(timeout)
    }
  }
  throw new AccessNetworkError(lastError instanceof DOMException && lastError.name === 'AbortError'
    ? '验证服务响应较慢，请点击重试'
    : '网络连接异常，请检查网络后重试')
}

export async function fetchAccessPasses(token: string): Promise<AccessPassSummary[]> {
  const response = await fetch('/api/admin/passes', { headers: { Authorization: `Bearer ${token}` } })
  return (await readResponse<{ items: AccessPassSummary[] }>(response)).items
}

export async function createAccessPass(token: string, input: { label: string; totalCredits: number; expiresAt: number | null }) {
  const response = await fetch('/api/admin/passes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readResponse<{ pass: AccessPassSummary; url: string }>(response)
}

export async function updateAccessPass(token: string, id: string, input: { action: 'adjust'; delta: number } | { action: 'status'; status: 'active' | 'disabled' }) {
  const response = await fetch(`/api/admin/passes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readResponse<{ pass: AccessPassSummary }>(response)
}

export async function fetchAccessPassDetail(token: string, id: string) {
  const response = await fetch(`/api/admin/passes/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
  return readResponse<AccessPassDetail>(response)
}

export async function reconcileAccessPasses(token: string) {
  const response = await fetch('/api/admin/passes/reconcile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return readResponse<{ inspected: number; released: number }>(response)
}
