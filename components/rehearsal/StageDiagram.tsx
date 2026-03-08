import React from 'react';

export type StageDiagramRisk = 'low' | 'medium' | 'high';
export type SeatView = 'left' | 'center' | 'right';

export interface Zone {
  angleStart: number;
  angleEnd: number;
  risk: StageDiagramRisk;
}

export interface BlockingPoint {
  x: number;
  y: number;
  label?: string;
}

interface StageDiagramProps {
  stageWidth?: number;
  audienceDistance?: number;
  performerX?: number;
  performerY?: number;
  exposureZones: Zone[];
  blockingPath?: BlockingPoint[];
  simulateSeatView?: boolean;
  selectedSeat?: SeatView;
  orientationDegrees?: number;
}

const WIDTH = 420;
const HEIGHT = 260;
const STAGE_X = 72;
const STAGE_Y = 108;
const STAGE_W = 276;
const STAGE_H = 106;

const seatPoints: Record<SeatView, { x: number; y: number; label: string; seatNumber: number }> = {
  left: { x: 112, y: 72, label: 'Seat 2', seatNumber: 2 },
  center: { x: 210, y: 52, label: 'Seat 4', seatNumber: 4 },
  right: { x: 308, y: 72, label: 'Seat 6', seatNumber: 6 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number) {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeWedge(cx: number, cy: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function getRiskFill(risk: StageDiagramRisk) {
  if (risk === 'high') return 'rgba(248, 113, 113, 0.45)';
  if (risk === 'medium') return 'rgba(250, 204, 21, 0.45)';
  return 'rgba(74, 222, 128, 0.45)';
}

function getRiskStroke(risk: StageDiagramRisk) {
  if (risk === 'high') return 'rgba(248, 113, 113, 0.85)';
  if (risk === 'medium') return 'rgba(250, 204, 21, 0.75)';
  return 'rgba(74, 222, 128, 0.75)';
}

function quadraticPoint(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
}

export default function StageDiagram({
  stageWidth = 10,
  audienceDistance = 6,
  performerX = 0,
  performerY = 0,
  exposureZones,
  blockingPath = [],
  simulateSeatView = false,
  selectedSeat = 'center',
  orientationDegrees = 0,
}: StageDiagramProps) {
  const stageCenterX = STAGE_X + STAGE_W / 2;
  const stageBottomY = STAGE_Y + STAGE_H - 22;
  const performerPx = stageCenterX + clamp(performerX / Math.max(stageWidth / 2, 1), -1, 1) * (STAGE_W * 0.34);
  const performerPy = stageBottomY - clamp(performerY / Math.max(audienceDistance, 1), -1, 1) * (STAGE_H * 0.5);

  const pathPoints = (blockingPath.length ? blockingPath : [{ x: performerX, y: performerY }]).map((point, index) => ({
    x: stageCenterX + clamp(point.x / Math.max(stageWidth / 2, 1), -1, 1) * (STAGE_W * 0.34),
    y: stageBottomY - clamp(point.y / Math.max(audienceDistance, 1), -1, 1) * (STAGE_H * 0.5),
    label: point.label || (index === 0 ? 'Start' : index === blockingPath.length - 1 ? 'Reveal' : 'Move'),
  }));

  const audienceArc = `M ${seatPoints.left.x} ${seatPoints.left.y} Q ${seatPoints.center.x} ${seatPoints.center.y - 26} ${seatPoints.right.x} ${seatPoints.right.y}`;
  const selectedSeatPoint = seatPoints[selectedSeat];

  const seatDots = Array.from({ length: 8 }, (_, index) => {
    const t = 0.06 + index * 0.125;
    const point = quadraticPoint(seatPoints.left.x, seatPoints.left.y, seatPoints.center.x, seatPoints.center.y - 26, seatPoints.right.x, seatPoints.right.y, t);
    return {
      ...point,
      seatNumber: index + 1,
      highlighted: index + 1 === selectedSeatPoint.seatNumber,
    };
  });

  const facingTip = polarToCartesian(performerPx, performerPy, 28, orientationDegrees);
  const facingLeft = polarToCartesian(performerPx, performerPy, 12, orientationDegrees - 145);
  const facingRight = polarToCartesian(performerPx, performerPy, 12, orientationDegrees + 145);
  const shiftedZones = exposureZones.map((zone) => ({
    ...zone,
    angleStart: zone.angleStart + orientationDegrees,
    angleEnd: zone.angleEnd + orientationDegrees,
  }));

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#120d1f] p-3">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Spatial blocking diagram">
        <defs>
          <marker id="blocking-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(196,181,253,0.95)" />
          </marker>
        </defs>

        <rect x="18" y="18" width="384" height="224" rx="18" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.07)" />

        {shiftedZones.map((zone, idx) => (
          <path
            key={`${idx}-${zone.angleStart}-${zone.angleEnd}`}
            d={describeWedge(performerPx, performerPy, 18, 130, zone.angleStart, zone.angleEnd)}
            fill={getRiskFill(zone.risk)}
            stroke={getRiskStroke(zone.risk)}
            strokeWidth="1.2"
          />
        ))}

        <path d={audienceArc} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="2.4" strokeDasharray="6 5" />
        <text x={210} y={22} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.62)">Audience Arc</text>

        {seatDots.map((seat) => (
          <g key={`seat-dot-${seat.seatNumber}`}>
            <circle
              cx={seat.x}
              cy={seat.y}
              r={seat.highlighted ? 7 : 4.25}
              fill={seat.highlighted ? 'rgba(196,181,253,0.96)' : 'rgba(255,255,255,0.44)'}
              stroke={seat.highlighted ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={seat.highlighted ? 2 : 0.8}
            />
            {(seat.seatNumber === 2 || seat.seatNumber === 4 || seat.seatNumber === 6) ? (
              <text x={seat.x} y={seat.y + 18} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.60)">{seat.seatNumber}</text>
            ) : null}
          </g>
        ))}

        <rect x={STAGE_X} y={STAGE_Y} width={STAGE_W} height={STAGE_H} rx="16" fill="rgba(139,92,246,0.12)" stroke="rgba(196,181,253,0.45)" strokeWidth="1.5" />
        <text x={stageCenterX} y={STAGE_Y + STAGE_H - 12} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.70)">Stage</text>

        <line x1={seatPoints.left.x} y1={seatPoints.left.y} x2={performerPx} y2={performerPy} stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" />
        <line x1={seatPoints.center.x} y1={seatPoints.center.y} x2={performerPx} y2={performerPy} stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" />
        <line x1={seatPoints.right.x} y1={seatPoints.right.y} x2={performerPx} y2={performerPy} stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" />

        {simulateSeatView ? (
          <line
            x1={selectedSeatPoint.x}
            y1={selectedSeatPoint.y}
            x2={performerPx}
            y2={performerPy}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="2.4"
            strokeDasharray="4 3"
          />
        ) : null}

        {pathPoints.length > 1 ? (
          <>
            <polyline
              points={pathPoints.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="rgba(196,181,253,0.95)"
              strokeWidth="3"
              strokeDasharray="7 5"
              markerEnd="url(#blocking-arrow)"
            />
            {pathPoints.map((point, index) => (
              <g key={`${point.x}-${point.y}-${index}`}>
                <circle cx={point.x} cy={point.y} r={5.5} fill="rgba(196,181,253,0.96)" stroke="rgba(17,24,39,0.8)" strokeWidth="1" />
                <text x={point.x + 10} y={point.y - 8} fontSize="10" fill="rgba(255,255,255,0.68)">{point.label}</text>
              </g>
            ))}
          </>
        ) : null}

        <circle cx={performerPx} cy={performerPy} r="8" fill="rgba(255,255,255,0.96)" stroke="rgba(17,24,39,0.85)" strokeWidth="1.5" />
        <path d={`M ${facingLeft.x} ${facingLeft.y} L ${facingTip.x} ${facingTip.y} L ${facingRight.x} ${facingRight.y} Z`} fill="rgba(255,255,255,0.96)" stroke="#ffffff" strokeWidth="2.5" />
        <text x={performerPx} y={performerPy + 16} textAnchor="middle" fontSize="10" fill="#cbd5f5">Performer</text>
      </svg>
    </div>
  );
}
