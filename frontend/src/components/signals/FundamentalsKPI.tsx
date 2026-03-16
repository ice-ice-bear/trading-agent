// frontend/src/components/signals/FundamentalsKPI.tsx
import React from 'react';
import type { DartFundamentals } from '../../types';

interface FundamentalsKPIProps {
  dartFundamentals: DartFundamentals;
  confidenceGrades: Record<string, string>;
}

const GradeBadge: React.FC<{ grade?: string }> = ({ grade }) => {
  if (!grade) return null;
  return (
    <span className={`grade-badge grade-${grade.toLowerCase()}`}>{grade}</span>
  );
};

interface Tile {
  label: string;
  field: keyof DartFundamentals;
  gradeField: string;
  format: (v: number) => string;
}

const TILES: Tile[] = [
  { label: 'PER', field: 'dart_per', gradeField: 'dart_per', format: v => `${v.toFixed(1)}x` },
  { label: 'PBR', field: 'dart_pbr', gradeField: 'dart_pbr', format: v => `${v.toFixed(2)}x` },
  { label: 'EPS YoY', field: 'dart_eps_yoy_pct', gradeField: 'dart_eps_yoy_pct', format: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` },
  { label: '부채비율', field: 'dart_debt_ratio', gradeField: 'dart_debt_ratio', format: v => `${v.toFixed(0)}%` },
  { label: '영업이익률', field: 'dart_operating_margin', gradeField: 'dart_operating_margin', format: v => `${v.toFixed(1)}%` },
];

export const FundamentalsKPI: React.FC<FundamentalsKPIProps> = ({
  dartFundamentals, confidenceGrades,
}) => {
  return (
    <div className="kpi-row">
      {TILES.map(({ label, field, gradeField, format }) => {
        const val = dartFundamentals[field];
        const grade = confidenceGrades[gradeField];
        return (
          <div className="kpi-tile" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">
              {val != null ? format(val) : '—'}
            </div>
            <GradeBadge grade={grade} />
          </div>
        );
      })}
    </div>
  );
};
