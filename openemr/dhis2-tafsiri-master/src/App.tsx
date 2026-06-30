import React, { FormEvent, useMemo, useState } from 'react'
import './tafsiri.css'

type QueryResponse = Record<string, unknown>
type TableRow = Record<string, unknown>

type QueryContextTable = {
    name: string
    description: string
}

type QueryContextElement = {
    name: string
    indicator_group: string
    description: string
    disaggregation_options: string
    metric_type: string
    source: string
}

type QueryContext = {
    tables: QueryContextTable[]
    data_elements: QueryContextElement[]
}

const blockedWritePattern = /\b(insert|delete|update|truncate)\b/i
const writeWarning =
    'Write operations are not allowed. Please ask a read-only question that does not insert, delete, or update data.'

function findQuery(data: unknown): string {
    if (!data || typeof data !== 'object') return ''
    const record = data as Record<string, unknown>
    const keys = ['query', 'slq_query', 'sql_query', 'sql', 'generated_query', 'generated_sql']
    const match = keys.find((k) => typeof record[k] === 'string')
    return match ? String(record[match]) : ''
}

function findRows(data: unknown): TableRow[] {
    if (!data || typeof data !== 'object') return []
    const record = data as Record<string, unknown>
    for (const key of ['rows', 'results', 'result', 'data', 'result_set']) {
        const value = record[key]
        if (Array.isArray(value)) {
            return value.filter(
                (row): row is TableRow =>
                    Boolean(row) && typeof row === 'object' && !Array.isArray(row)
            )
        }
    }
    return []
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

function escapeCsvCell(value: unknown): string {
    const cell = formatCell(value)
    if (/[",\n\r]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`
    return cell
}

function downloadCsv(rows: TableRow[], columns: string[]) {
    const header = columns.map(escapeCsvCell).join(',')
    const body = rows.map((row) => columns.map((col) => escapeCsvCell(row[col])).join(','))
    const csv = [header, ...body].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tafsiri-resultset-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
}

function findQueryContext(data: unknown): QueryContext | null {
    if (!data || typeof data !== 'object') return null
    const record = data as Record<string, unknown>
    const ctx = record.query_context
    if (!ctx || typeof ctx !== 'object') return null
    const c = ctx as Record<string, unknown>
    return {
        tables: Array.isArray(c.tables) ? (c.tables as QueryContextTable[]) : [],
        data_elements: Array.isArray(c.data_elements)
            ? (c.data_elements as QueryContextElement[])
            : [],
    }
}

const PAGE_SIZE = 25

const MyApp: React.FC = () => {
    const [text, setText] = useState('')
    const [result, setResult] = useState<QueryResponse | null>(null)
    const [error, setError] = useState('')
    const [blockedAttempts, setBlockedAttempts] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [page, setPage] = useState(0)
    const [summaryOpen, setSummaryOpen] = useState(false)
    const [queryExpanded, setQueryExpanded] = useState(false)

    const query = useMemo(() => findQuery(result), [result])
    const rows = useMemo(() => findRows(result), [result])
    const queryContext = useMemo(() => findQueryContext(result), [result])
    const columns = useMemo(
        () => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
        [rows]
    )
    const totalPages = Math.ceil(rows.length / PAGE_SIZE)
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const canDownload = rows.length > 0 && columns.length > 0

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (!text.trim()) {
            setError('Enter a question first.')
            return
        }

        if (blockedWritePattern.test(text)) {
            setBlockedAttempts((n) => n + 1)
            setError(writeWarning)
            setResult(null)
            return
        }

        setIsLoading(true)
        setError('')
        setResult(null)

        try {
            const endpoint = 'https://khis-tafsiri.backend.hmislocal.org/api/text2sql'

            const response = await fetch(`${endpoint}/query_from_natural_language`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text.trim(), user_id: 'tafsiri-frontend' }),
            })
            const data = (await response.json()) as Record<string, unknown>

            if (!response.ok) {
                const msg =
                    typeof data === 'object'
                        ? ((data.error ??
                              data.message ??
                              data.detail ??
                              'Could not generate a query.') as string)
                        : 'Could not generate a query.'
                throw new Error(msg)
            }

            setResult(data)
            setPage(0)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not generate a query.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <main className="tf-page">
            <section className="tf-workspace">
                <div className="tf-intro">
                    <div className="tf-brand">
                        <div className="tf-logo-mark" aria-hidden="true">
                            <span className="tf-logo-ring" />
                            <span className="tf-logo-bar tf-logo-bar-short" />
                            <span className="tf-logo-bar tf-logo-bar-mid" />
                            <span className="tf-logo-bar tf-logo-bar-tall" />
                        </div>
                        <div className="tf-brand-text">
                            <h3 className="tf-eyebrow">TAFSIRI</h3>
                            <p className="tf-acronym-desc">
                                Transformational AI For SQL Inferences and Reporting Integration
                            </p>
                        </div>
                    </div>
                    <h3 className="tf-tagline">Transform questions into SQL reports.</h3>
                    <p className="tf-intro-copy">
                        Generate a query from natural language, then review the SQL and returned
                        data in one clean workspace.
                    </p>
                </div>

                <form className="tf-query-form" onSubmit={handleSubmit}>
                    <div className="tf-form-header">
                        <label htmlFor="prompt">Ask your question below</label>
                        <span>Natural language to SQL</span>
                    </div>
                    <div className="tf-prompt-row">
                        <textarea
                            id="prompt"
                            name="prompt"
                            rows={4}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="What was the total number of live births in December 2025?"
                        />
                        <button type="submit" disabled={isLoading}>
                            {isLoading ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                </form>

                {error ? <p className="tf-error">{error}</p> : null}
                {blockedAttempts ? (
                    <p className="tf-security-counter">
                        Blocked write requests this session:{' '}
                        <strong>{blockedAttempts}</strong>
                    </p>
                ) : null}

                <div className="tf-results-area">
                    <div className="tf-table-wrap">
                        <div className="tf-section-header">
                            <h2>Result Set</h2>
                            <div className="tf-result-actions">
                                {rows.length ? <span>{rows.length} rows</span> : null}
                                <button
                                    className={`tf-summary-btn${summaryOpen ? ' active' : ''}`}
                                    type="button"
                                    onClick={() => setSummaryOpen((o) => !o)}
                                    aria-expanded={summaryOpen}
                                >
                                    Summary
                                </button>
                                <button
                                    className="tf-download-btn"
                                    type="button"
                                    disabled={!canDownload}
                                    onClick={() => downloadCsv(rows, columns)}
                                >
                                    Download CSV
                                </button>
                            </div>
                        </div>

                        {rows.length && columns.length ? (
                            <>
                                <div className="tf-table-scroll">
                                    <table>
                                        <thead>
                                            <tr>
                                                {columns.map((col) => (
                                                    <th key={col}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageRows.map((row, i) => (
                                                <tr key={i}>
                                                    {columns.map((col) => (
                                                        <td key={col}>{formatCell(row[col])}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {totalPages > 1 && (
                                    <div className="tf-pagination">
                                        <button
                                            className="tf-page-btn"
                                            type="button"
                                            disabled={page === 0}
                                            onClick={() => setPage((p) => p - 1)}
                                        >
                                            ‹ Prev
                                        </button>
                                        <span className="tf-page-info">
                                            Page {page + 1} of {totalPages}
                                        </span>
                                        <button
                                            className="tf-page-btn"
                                            type="button"
                                            disabled={page === totalPages - 1}
                                            onClick={() => setPage((p) => p + 1)}
                                        >
                                            Next ›
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="tf-empty-state">
                                {result
                                    ? 'No tabular rows were returned.'
                                    : 'Result rows will appear here.'}
                            </div>
                        )}
                    </div>

                    <aside
                        className={`tf-summary-panel${summaryOpen ? ' open' : ''}`}
                        aria-hidden={!summaryOpen}
                        aria-label="Summary"
                    >
                        <div className="tf-summary-header">
                            <h2>Summary</h2>
                            <button
                                className="tf-summary-close"
                                type="button"
                                onClick={() => setSummaryOpen(false)}
                                aria-label="Close summary"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="tf-summary-body">
                            {queryContext ? (
                                <div className="tf-query-context">
                                    {queryContext.data_elements.length > 0 && (
                                        <>
                                            <h3>Indicators</h3>
                                            {queryContext.data_elements.map((el) => (
                                                <div key={el.name} className="tf-context-item">
                                                    <div className="tf-context-item-row">
                                                        <span className="tf-context-item-name">
                                                            {el.name}
                                                        </span>
                                                        <span className="tf-context-item-badge">
                                                            {el.indicator_group}
                                                        </span>
                                                    </div>
                                                    <p className="tf-context-item-desc">
                                                        {el.description}
                                                    </p>
                                                    <p className="tf-context-item-meta">
                                                        {el.source} &middot; {el.metric_type}{' '}
                                                        &middot; {el.disaggregation_options}
                                                    </p>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {queryContext.tables.length > 0 && (
                                        <>
                                            <h3>Tables used</h3>
                                            {queryContext.tables.map((table) => (
                                                <div key={table.name} className="tf-context-item">
                                                    <span className="tf-context-item-name">
                                                        {table.name}
                                                    </span>
                                                    <p className="tf-context-item-desc">
                                                        {table.description}
                                                    </p>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    <hr className="tf-summary-divider" />
                                </div>
                            ) : null}
                        </div>
                    </aside>

                    <div className="tf-query-box">
                        <div className="tf-section-header">
                            <h2>Query</h2>
                            <div className="tf-result-actions">
                                <span>Read only</span>
                                <button
                                    className={`tf-summary-btn${queryExpanded ? ' active' : ''}`}
                                    type="button"
                                    onClick={() => setQueryExpanded((o) => !o)}
                                    aria-expanded={queryExpanded}
                                >
                                    {queryExpanded ? 'Collapse' : 'Expand'}
                                </button>
                            </div>
                        </div>
                        <div className={`tf-query-collapsible${queryExpanded ? ' open' : ''}`}>
                            <div className="tf-query-collapsible-inner">
                                <textarea
                                    className="tf-query-output"
                                    readOnly
                                    value={query || 'Generated SQL will appear here.'}
                                    aria-label="Generated SQL query"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    )
}

export default MyApp
