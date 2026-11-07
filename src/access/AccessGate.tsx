export function AccessGate({ loading, error }: { loading: boolean; error: string }) {
  return (
    <main className="access-gate">
      <section>
        <span className="access-badge">AI 专属生成站</span>
        <h1>{loading ? '正在验证专属链接…' : '需要有效的专属链接'}</h1>
        {!loading && <p>{error || '请从购买后收到的完整链接进入。'}</p>}
        {!loading && <p className="access-muted">本地量化、编辑与导出功能请前往免费站使用。</p>}
      </section>
    </main>
  )
}
