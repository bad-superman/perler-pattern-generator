import { useCallback, useEffect, useState } from 'react'
import { IS_PRO_SITE } from '../config/site'
import { AccessClientError, verifyAccessToken, type AccessPassSummary } from './client'

const TOKEN_KEY = 'perler-pro-access-token'

function tokenFromPath() {
  const match = window.location.pathname.match(/^\/access\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : ''
}

export function usePaidAccess() {
  const [token, setToken] = useState(() => tokenFromPath() || sessionStorage.getItem(TOKEN_KEY) || '')
  const [pass, setPass] = useState<AccessPassSummary | null>(null)
  const [loading, setLoading] = useState(IS_PRO_SITE)
  const [error, setError] = useState('')

  const refresh = useCallback(async (nextToken = token) => {
    if (!IS_PRO_SITE) return
    if (!nextToken) {
      setLoading(false)
      setPass(null)
      setError('请使用有效的专属链接进入付费站')
      return
    }
    setLoading(true)
    try {
      const nextPass = await verifyAccessToken(nextToken)
      sessionStorage.setItem(TOKEN_KEY, nextToken)
      setToken(nextToken)
      setPass(nextPass)
      setError('')
      if (tokenFromPath()) window.history.replaceState({}, '', '/')
    } catch (cause) {
      sessionStorage.removeItem(TOKEN_KEY)
      setPass(null)
      setError(cause instanceof AccessClientError ? cause.message : '专属链接验证失败')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void refresh() })
    return () => window.cancelAnimationFrame(frame)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { token, pass, loading, error, refresh, setPass }
}
