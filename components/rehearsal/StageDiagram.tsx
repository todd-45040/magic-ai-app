import React from 'react';

export type StageRiskLevel = 'low' | 'medium' | 'high';

export interface Zone {
  angleStart: number;
  angleEnd: number;
  risk: StageRiskLevel;
}

export interface StageDiagramProps {
  stageWidth: number;
  audienceDistance: number;
  performerX: number;
  performerY: number;
  exposureZones: Zone[];
  title?: string;
}

const VIEWBOX_WIDTH = 520;
const VIEWBOX_HEIGHT = 360;
const STAGE_HEIGHT = 112;
const STAGE_Y = 190;
const STAGE_X = 90;
const AUDIENCE_CENTER_X = VIEWBOX_WIDTH / 2;
const AUDIENCE_CENTER_Y = 72;
const AUDIENCE_BASE_RADIUS = 172;

const riskConfig: Record<StageRiskLevel, { fill: string; stroke: string; label: string }> = {
  low: { fill: 'rgba(74, 222, 128, 0.20)', stroke: 'rgba(74, 222, 128, 0.85)', label: 'Safe angle' },
  medium: { fill: 'rgba(250, 204, 21, 0.18)', stroke: 'rgba(250, 204, 21, 0.85)', label: 'Risk' },
  high: { fill: 'rgba(248, 113, 113, 0.20)', stroke: 'rgba(248, 113, 113, 0.92)', label: 'Exposure' },
};

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function describeWedge(cx: number, cy: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${innerStart.x} ${innerStart.y}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export default function StageDiagram({
  stageWidth,
  audienceDistance,
  performerX,
  performerY,
  exposureZones,
  title = 'Spatial Blocking Diagram',
}: StageDiagramProps) {
  const clampedStageWidth = Math.max(240, Math.min(380, stageWidth));
  const scaledDistance = Math.max(128, Math.min(196, audienceDistance));
  const performerCx = AUDIENCE_CENTER_X + performerX;
  const performerCy = STAGE_Y + STAGE_HEIGHT / 2 - performerY;
  const stageLeft = STAGE_X + (340 - clampedStageWidth) / 2;
  const stageTop = STAGE_Y;
  const stageRadius = 16;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#070b16] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-white/55">Stage geometry, audience arc, sightlines, and exposure wedges.</p>
        </div>
        <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
          Stage View
        </div>
      </div>

      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-auto w-full overflow-visible rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(91,33,182,0.18),rgba(7,11,22,0.96)_55%)]">
        <defs>
          <linearGradient id="stageGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(99,102,241,0.45)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0.15)" />
          </linearGradient>
        </defs>

        <text x={AUDIENCE_CENTER_X} y={34} textAnchor="middle" className="fill-white/70" style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Audience Sightline Arc
        </text>

        {exposureZones.map((zone, index) => {
          const colors = riskConfig[zone.risk];
          return (
            <path
              key={`${zone.risk}-${zone.angleStart}-${zone.angleEnd}-${index}`}
              d={describeWedge(AUDIENCE_CENTER_X, AUDIENCE_CENTER_Y, scaledDistance - 36, scaledDistance, zone.angleStart, zone.angleEnd)}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth="1.5"
            />
          );
        })}

        <path d={describeArc(AUDIENCE_CENTER_X, AUDIENCE_CENTER_Y, scaledDistance, -62, 62)} fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeDasharray="5 8" />
        <path d={describeArc(AUDIENCE_CENTER_X, AUDIENCE_CENTER_Y, scaledDistance - 20, -62, 62)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

        {[0, -34, 34].map((angle, idx) => {
          const target = polarToCartesian(AUDIENCE_CENTER_X, AUDIENCE_CENTER_Y, scaledDistance - 2, angle);
          return (
            <line
              key={`sightline-${idx}`}
              x1={performerCx}
              y1={performerCy}
              x2={target.x}
              y2={target.y}
              stroke="rgba(255,255,255,0.44)"
              strokeWidth="2"
              strokeDasharray="7 7"
            />
          );
        })}

        <rect x={stageLeft} y={stageTop} rx={stageRadius} ry={stageRadius} width={clampedStageWidth} height={STAGE_HEIGHT} fill="url(#stageGlow)" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
        <text x={AUDIENCE_CENTER_X} y={STAGE_Y + STAGE_HEIGHT - 18} textAnchor="middle" className="fill-white/75" style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Stage
        </text>

        <circle cx={performerCx} cy={performerCy} r="12" fill="rgba(244,114,182,0.95)" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
        <text x={performerCx} y={performerCy + 34} textAnchor="middle" className="fill-white" style={{ fontSize: 13, fontWeight: 700 }}>
          Performer
        </text>

        <line x1={performerCx} y1={performerCy} x2={performerCx} y2={performerCy - 30} stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" strokeLinecap="round" />
        <path d={`M ${performerCx - 8} ${performerCy - 24} L ${performerCx} ${performerCy - 36} L ${performerCx + 8} ${performerCy - 24}`} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
