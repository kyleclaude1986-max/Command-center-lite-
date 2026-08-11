import { fmtIsoShort } from "@/lib/dates";
import type { MetricSeries } from "@/lib/body";

const WIDTH = 640;
const HEIGHT = 160;
const PAD = { top: 12, right: 8, bottom: 20, left: 40 };

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function MetricChart({ series, color }: { series: MetricSeries; color: string }) {
  const { points, unit } = series;

  if (points.length === 0) {
    return <p className="text-sm text-ink-muted">Nothing recorded yet.</p>;
  }

  if (points.length === 1) {
    return (
      <p className="text-sm">
        <span className="tabular-nums text-lg font-medium">{round(points[0]!.value)}</span>
        <span className="text-ink-muted"> {unit}</span>
        <span className="text-ink-muted"> on {fmtIsoShort(points[0]!.measuredOn)}</span>
      </p>
    );
  }

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin;
  const padding = spread === 0 ? Math.max(1, rawMax * 0.02) : spread * 0.15;
  const min = rawMin - padding;
  const max = rawMax + padding;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const x = (index: number) =>
    PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => PAD.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  const line = points.map((point, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(point.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${PAD.top + plotHeight} L${x(0)},${PAD.top + plotHeight} Z`;

  const gradientId = `metric-${series.key}`;

  return (
    <figure className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-40 w-full min-w-[280px]"
        role="img"
        aria-label={`${series.label} over time, ${round(rawMin)} to ${round(rawMax)} ${unit}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[rawMax, rawMin].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="#e7e3db"
              strokeWidth="1"
            />
            <text x={0} y={y(value) + 4} fontSize="11" fill="#6a7380">
              {round(value)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1]!.value)} r="3.5" fill={color} />

        <text x={PAD.left} y={HEIGHT - 4} fontSize="11" fill="#6a7380">
          {fmtIsoShort(points[0]!.measuredOn)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 4} fontSize="11" fill="#6a7380" textAnchor="end">
          {fmtIsoShort(points[points.length - 1]!.measuredOn)}
        </text>
      </svg>
    </figure>
  );
}
