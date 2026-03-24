interface PeerData {
  sector: string;
  target?: { code: string; name: string; per: number | null; pbr: number | null };
  peers: Array<{ code: string; name: string; per: number | null; pbr: number | null; isTarget?: boolean }>;
}

export default function PeerComparison({ data }: { data: PeerData }) {
  if (!data.peers || data.peers.length === 0) return null;

  const all = [
    ...(data.target ? [{ ...data.target, isTarget: true }] : []),
    ...data.peers.map(p => ({ ...p, isTarget: false })),
  ];

  return (
    <div className="signal-section">
      <span className="section-label">동종 업종 비교 ({data.sector})</span>
      <table style={{ width: '100%', fontSize: '0.75rem', marginTop: '4px', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '2px 4px' }}>종목</th>
            <th style={{ textAlign: 'right', padding: '2px 4px' }}>PER</th>
            <th style={{ textAlign: 'right', padding: '2px 4px' }}>PBR</th>
          </tr>
        </thead>
        <tbody>
          {all.map((p, i) => (
            <tr key={i} style={p.isTarget ? { fontWeight: 600, background: 'var(--color-surface, #f9fafb)' } : {}}>
              <td style={{ padding: '2px 4px' }}>{p.name}</td>
              <td style={{ textAlign: 'right', padding: '2px 4px' }}>{p.per?.toFixed(1) ?? '-'}</td>
              <td style={{ textAlign: 'right', padding: '2px 4px' }}>{p.pbr?.toFixed(2) ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
