export interface GalleryItem {
  id: string
  nickname: string
  brand: 'mard' | 'hama'
  cols: number
  rows: number
  mirrored: boolean
  colorCount: number
  cells: number[]
  createdAt: number
  reviewedAt: number | null
  status?: 'pending' | 'approved' | 'rejected' | 'hidden'
}

export interface GalleryPageResult {
  page: number
  pageSize: number
  total: number
  items: GalleryItem[]
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string }
  return body.error || '请求失败'
}

export async function submitGalleryShare(input: {
  nickname: string
  brand: 'mard' | 'hama'
  cols: number
  rows: number
  mirrored: boolean
  cells: number[]
}) {
  const response = await fetch('/api/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await readError(response))
}

export async function fetchGalleryPage(page: number, pageSize: number): Promise<GalleryPageResult> {
  const response = await fetch(`/api/gallery?page=${page}&pageSize=${pageSize}`)
  if (!response.ok) throw new Error(await readError(response))
  return response.json() as Promise<GalleryPageResult>
}

function adminHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function fetchAdminGallery(token: string, status: string): Promise<GalleryItem[]> {
  const response = await fetch(`/api/admin/gallery?status=${encodeURIComponent(status)}`, { headers: adminHeaders(token) })
  if (!response.ok) throw new Error(await readError(response))
  const body = await response.json() as { items: GalleryItem[] }
  return body.items
}

export async function updateAdminGallery(token: string, id: string, patch: { nickname?: string; status?: string }) {
  const response = await fetch(`/api/admin/gallery/${id}`, {
    method: 'PATCH',
    headers: adminHeaders(token),
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(await readError(response))
}

export async function deleteAdminGallery(token: string, id: string) {
  const response = await fetch(`/api/admin/gallery/${id}`, { method: 'DELETE', headers: adminHeaders(token) })
  if (!response.ok) throw new Error(await readError(response))
}

export function formatGalleryDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(timestamp))
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${month}月${day}日`
}
