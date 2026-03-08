import React, { useState, useRef, useEffect } from 'react';

function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach(r => lines.push(r.map(escape).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { downloadCSV };

export default function HoverBreakdown({ children, title, headers, rows, csvFilename, style }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const timerRef = useRef(null);

  function handleEnter(e) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
      }
      setShow(true);
    }, 250);
  }

  function handleLeave() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 200);
  }

  function handlePopEnter() {
    clearTimeout(timerRef.current);
  }

  function handlePopLeave() {
    timerRef.current = setTimeout(() => setShow(false), 200);
  }

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  // Reposition if popover goes off-screen
  useEffect(() => {
    if (show && popRef.current) {
      const rect = popRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let newLeft = pos.left;
      let newTop = pos.top;
      if (rect.right > vw - 16) newLeft = Math.max(8, vw - rect.width - 16);
      if (rect.bottom > vh - 16) newTop = Math.max(8, pos.top - rect.height - (wrapRef.current?.getBoundingClientRect().height || 0) - 12);
      if (newLeft !== pos.left || newTop !== pos.top) setPos({ top: newTop, left: newLeft });
    }
  }, [show]);

  const displayRows = rows.slice(0, 20);
  const hasMore = rows.length > 20;

  return (
    <div
      ref={wrapRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ position: 'relative', cursor: 'default', ...style }}
    >
      {children}
      {show && rows.length > 0 && (
        <div
          ref={popRef}
          onMouseEnter={handlePopEnter}
          onMouseLeave={handlePopLeave}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            background: '#0F2137',
            border: '1px solid #1E3557',
            borderRadius: '10px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            padding: '0',
            minWidth: '280px',
            maxWidth: '480px',
            maxHeight: '360px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #1E3557',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#f8fafc' }}>
              {title || 'Breakdown'} <span style={{ color: '#64748b', fontWeight: '400' }}>({rows.length})</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); downloadCSV(csvFilename || 'export.csv', headers, rows); }}
              style={{
                padding: '3px 10px',
                background: 'rgba(200,162,88,0.1)',
                border: '1px solid rgba(200,162,88,0.3)',
                borderRadius: '5px',
                color: '#C8A258',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif",
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseEnter={e => { e.target.style.background = 'rgba(200,162,88,0.2)'; }}
              onMouseLeave={e => { e.target.style.background = 'rgba(200,162,88,0.1)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              CSV
            </button>
          </div>
          {/* Table */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#64748b',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid #1E3557',
                      position: 'sticky',
                      top: 0,
                      background: '#0F2137',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #0B1520' }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{
                        padding: '5px 10px',
                        color: j === 0 ? '#f8fafc' : '#94a3b8',
                        fontWeight: j === 0 ? '500' : '400',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '180px',
                      }}>{cell}</td>
                    ))}
                  </tr>
                ))}
                {hasMore && (
                  <tr>
                    <td colSpan={headers.length} style={{ padding: '6px 10px', color: '#64748b', fontSize: '10px', textAlign: 'center' }}>
                      +{rows.length - 20} more — download CSV for full data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
