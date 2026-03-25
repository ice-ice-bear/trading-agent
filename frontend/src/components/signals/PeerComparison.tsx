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
      <table className="peer-table">
        <thead>
          <tr>
            <th>종목</th>
            <th>PER</th>
            <th>PBR</th>
          </tr>
        </thead>
        <tbody>
          {all.map((p, i) => (
            <tr key={i} className={p.isTarget ? 'peer-target' : ''}>
              <td>{p.name}</td>
              <td>{p.per?.toFixed(1) ?? '-'}</td>
              <td>{p.pbr?.toFixed(2) ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
