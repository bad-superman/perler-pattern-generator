export function AccessGate({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  const missingLink = !loading && error === '请使用有效的专属链接进入付费站'
  return (
    <main className="access-gate">
      <section>
        <span className="access-badge">AI 专属生成站</span>
        <h1>{loading ? '正在验证专属链接…' : missingLink ? '需要有效的专属链接' : '暂时无法完成验证'}</h1>
        {!loading && <p>{error || '请从购买后收到的完整链接进入。'}</p>}
        {!loading && !missingLink && <button type="button" className="primary-button" onClick={onRetry}>重新验证</button>}
      </section>
    </main>
  )
}
