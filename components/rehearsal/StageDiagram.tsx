import React from 'react';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Zone {
  angleStart: number;
  angleEnd: number;
  risk: RiskLevel;
}

export interface Point {
  x: number;
  y: number;
}

export interface StageDiagramProps {
  stageWidth?: number;
  audienceDistance?: number;
  performerX?: number;
  performerY?: number;
  performerFacingAngle?: number;
  exposureZones: Zone[];
  blockingPath?: Point[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toRadians = (deg: number) => (deg * Math.PI) / 180;

const riskStyle = (risk: RiskLevel) => {
  if (risk === 'high') return { fill: 'rgba(239,68,68,0.28)', stroke: 'rgba(248,113,113,0.95)' };
  if (risk === 'medium') return { fill: 'rgba(250,204,21,0.22)', stroke: 'rgba(250,204,21,0.95)' };
  return { fill: 'rgba(34,197,94,0.18)', stroke: 'rgba(74,222,128,0.95)' };
};

const describeSeatSafety = (zones: Zone[]) => {
  const buckets = {
    left: 'low' as RiskLevel,
    center: 'low' as RiskLevel,
    right: 'low' as RiskLevel,
  };

  const elevate = (current: RiskLevel, next: RiskLevel): RiskLevel => {
    const rank = { low: 1, medium: 2, high: 3 };
    return rank[next] > rank[current] ? next : current;
  };

  zones.forEach(zone => {
    const mid = (zone.angleStart + zone.angleEnd) / 2;
    if (mid < -12) buckets.left = elevate(buckets.left, zone.risk);
    else if (mid > 12) buckets.right = elevate(buckets.right, zone.risk);
    else buckets.center = elevate(buckets.center, zone.risk);
  });

  return buckets;
};

export default function StageDiagram({
  stageWidth = 10,
  audienceDistance = 8,
  performerX = 0,
  performerY = 0,
  performerFacingAngle = 0,
  exposureZones,
  blockingPath,
}: StageDiagramProps) {
  const width = 520;
  const height = 300;
  const stageLeft = 90;
  const stageTop = 150;
  const stagePixelWidth = 340;
  const stagePixelHeight = 90;
  const centerX = stageLeft + stagePixelWidth / 2;
  const performerBaseY = stageTop + 34;
  const scaleX = stagePixelWidth / Math.max(stageWidth, 1);
  const normalizedAudience = clamp(audienceDistance, 1, 20);
  const wedgeRadius = 120 + normalizedAudience * 3;
  const performerPx = centerX + performerX * scaleX;
  const performerPy = performerBaseY + performerY * 10;
  const frontArcY = stageTop - 18;

  const makeWedgePath = (startDeg: number, endDeg: number) => {
    const start = toRadians(startDeg - 90 + performerFacingAngle);
    const end = toRadians(endDeg - 90 + performerFacingAngle);
    const x1 = performerPx + wedgeRadius * Math.cos(start);
    const y1 = performerPy + wedgeRadius * Math.sin(start);
    const x2 = performerPx + wedgeRadius * Math.cos(end);
    const y2 = performerPy + wedgeRadius * Math.sin(end);
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${performerPx} ${performerPy} L ${x1} ${y1} A ${wedgeRadius} ${wedgeRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  const seatSafety = describeSeatSafety(exposureZones);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible" role="img" aria-label="Stage blocking diagram with exposure zones">
        <defs>
          <linearGradient id="stageGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(168,85,247,0.35)" />
            <stop offset="100%" stopColor="rgba(30,41,59,0.65)" />
          </linearGradient>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d={`M ${stageLeft + 18} ${frontArcY} Q ${centerX} ${frontArcY - 74} ${stageLeft + stagePixelWidth - 18} ${frontArcY}`} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeDasharray="5 7" />
        <text x={centerX} y={frontArcY - 86} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="12">Audience arc</text>

        {exposureZones.map((zone, index) => {
          const style = riskStyle(zone.risk);
          return <path key={`${zone.angleStart}-${zone.angleEnd}-${index}`} d={makeWedgePath(zone.angleStart, zone.angleEnd)} fill={style.fill} stroke={style.stroke} strokeWidth="1.6" />;
        })}

        {[-38, 0, 38].map((deg, i) => {
          const r = wedgeRadius + 6;
          const theta = toRadians(deg - 90 + performerFacingAngle);
          const x2 = performerPx + r * Math.cos(theta);
          const y2 = performerPy + r * Math.sin(theta);
          return <line key={i} x1={performerPx} y1={performerPy} x2={x2} y2={y2} stroke="rgba(255,255,255,0.38)" strokeWidth="1.5" strokeDasharray="4 5" />;
        })}

        <rect x={stageLeft} y={stageTop} width={stagePixelWidth} height={stagePixelHeight} rx="18" fill="url(#stageGlow)" stroke="rgba(196,181,253,0.5)" strokeWidth="2" />
        <text x={centerX} y={stageTop + stagePixelHeight + 24} textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="13">Stage / performance area</text>

        {blockingPath && blockingPath.length > 1 && (
          <polyline
            points={blockingPath.map(point => `${centerX + point.x * scaleX},${performerBaseY + point.y * 10}`).join(' ')}
            fill="none"
            stroke="rgba(129,140,248,0.9)"
            strokeWidth="3"
            strokeDasharray="6 6"
          />
        )}

        <circle cx={performerPx} cy={performerPy} r="8" fill="rgba(244,114,182,0.95)" filter="url(#softGlow)" />
        <circle cx={performerPx} cy={performerPy} r="15" fill="none" stroke="rgba(244,114,182,0.3)" strokeWidth="2" />
        <text x={performerPx} y={performerPy - 18} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="12">Performer</text>

        <g fontSize="11" fill="rgba(255,255,255,0.72)">
          <text x={stageLeft - 6} y={frontArcY + 8} textAnchor="end">Left seats</text>
          <text x={centerX} y={frontArcY + 8} textAnchor="middle">Center seats</text>
          <text x={stageLeft + stagePixelWidth + 6} y={frontArcY + 8} textAnchor="start">Right seats</text>
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-white/70 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="font-semibold text-white">Left view:</span> {seatSafety.left === 'high' ? 'danger' : seatSafety.left === 'medium' ? 'watch carefully' : 'safer'}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="font-semibold text-white">Center view:</span> {seatSafety.center === 'high' ? 'danger' : seatSafety.center === 'medium' ? 'watch carefully' : 'safer'}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="font-semibold text-white">Right view:</span> {seatSafety.right === 'high' ? 'danger' : seatSafety.right === 'medium' ? 'watch carefully' : 'safer'}
        </div>
      </div>
    </div>
  );
}
