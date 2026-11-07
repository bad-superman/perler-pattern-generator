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

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { code?: string; error?: string }
  if (!response.ok) throw new AccessClientError(body.error || '请求失败', body.code || 'REQUEST_FAILED', response.status)
  return body
}

export async function verifyAccessToken(token: string): Promise<AccessPassSummary> {
  const response = await fetch('/api/access/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const body = await readResponse<{ pass: AccessPassSummary }>(response)
  return body.pass
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
