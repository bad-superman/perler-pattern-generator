import { useCallback, useEffect, useState } from 'react'
import { IS_PRO_SITE } from '../config/site'
import { AccessClientError, AccessNetworkError, verifyAccessToken, type AccessPassSummary } from './client'

const TOKEN_KEY = 'perler-pro-access-token'

function tokenFromPath() {
  const match = window.location.pathname.match(/^\/access\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : ''
}

function storedToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function storeToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Some embedded browsers disable sessionStorage. The in-memory token still works.
  }
}

export function usePaidAccess() {
  const [token, setToken] = useState(() => tokenFromPath() || storedToken())
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
      storeToken(nextToken)
      setToken(nextToken)
      setPass(nextPass)
      setError('')
      if (tokenFromPath()) window.history.replaceState({}, '', '/')
    } catch (cause) {
      if (cause instanceof AccessClientError) storeToken('')
      setPass(null)
      setError(cause instanceof AccessClientError || cause instanceof AccessNetworkError
        ? cause.message
        : '验证服务暂时不可用，请重试')
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
