// 표 대신 한눈에 보는 막대들. 라이브러리 없이 CSS 막대로 그린다(색은 styles.css의 tone-*).
import { formatNumber } from "../model/format.ts";

export type Segment = {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** styles.css의 tone-{tone} 색. */
  readonly tone: string;
};

/** 0~100 사이 백분율. 0이 아닌 값은 아주 작아도 보이게 최소 폭을 CSS(min-width)로 준다. */
function percent(value: number, total: number): string {
  return `${total > 0 ? (value / total) * 100 : 0}%`;
}

/**
 * 한 줄 누적 막대와 범례. onSelect가 있으면 범례(키보드)와 막대 조각(마우스)을 눌러 고를 수 있다.
 * 고른 조각이 있으면 나머지는 흐리게 보인다.
 */
export function StackedBar({
  label,
  segments,
  selected = null,
  onSelect,
}: {
  readonly label: string;
  readonly segments: readonly Segment[];
  readonly selected?: string | null;
  readonly onSelect?: (key: string) => void;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);
  return (
    <div className="stacked">
      <div className={`stacked-bar${selected ? " has-selection" : ""}`} role="img" aria-label={`${label}: ${segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}`}>
        {visible.map((segment) =>
          onSelect ? (
            <button
              type="button"
              key={segment.key}
              tabIndex={-1}
              aria-hidden="true"
              className={`seg tone-${segment.tone}${selected === segment.key ? " selected" : ""}`}
              style={{ width: percent(segment.value, total) }}
              title={`${segment.label} ${formatNumber(segment.value)}`}
              onClick={() => onSelect(segment.key)}
            />
          ) : (
            <span key={segment.key} className={`seg tone-${segment.tone}`} style={{ width: percent(segment.value, total) }} title={`${segment.label} ${formatNumber(segment.value)}`} />
          ),
        )}
      </div>
      <div className="legend">
        {segments.map((segment) =>
          onSelect ? (
            <button
              type="button"
              key={segment.key}
              className={`legend-item${selected === segment.key ? " selected" : ""}`}
              aria-pressed={selected === segment.key}
              disabled={segment.value === 0}
              onClick={() => onSelect(segment.key)}
            >
              <i className={`dot tone-${segment.tone}`} />
              {segment.label} <strong>{formatNumber(segment.value)}</strong>
            </button>
          ) : (
            <span key={segment.key} className="legend-item">
              <i className={`dot tone-${segment.tone}`} />
              {segment.label} <strong>{formatNumber(segment.value)}</strong>
            </span>
          ),
        )}
      </div>
    </div>
  );
}

/** 얇은 누적 막대. 전체(total) 중 각 조각이 차지하는 비율만큼 칠한다. */
export function MiniBar({ parts, total, label }: { readonly parts: readonly Segment[]; readonly total: number; readonly label: string }) {
  return (
    <span className="mini-bar" role="img" aria-label={label}>
      {parts
        .filter((part) => part.value > 0)
        .map((part) => (
          <span key={part.key} className={`seg tone-${part.tone}`} style={{ width: percent(part.value, total) }} title={`${part.label} ${formatNumber(part.value)}`} />
        ))}
    </span>
  );
}

/** 값 하나를 최댓값 대비 길이로 보여 주는 막대와 숫자. */
export function Meter({ value, max, tone, label }: { readonly value: number; readonly max: number; readonly tone: string; readonly label: string }) {
  return (
    <span className="meter" title={`${label} ${formatNumber(value)}`}>
      <span className="meter-track" aria-hidden="true">
        {value > 0 && <span className={`meter-fill tone-${tone}`} style={{ width: percent(value, max) }} />}
      </span>
      <span className="meter-value">
        <span className="sr-only">{label} </span>
        {formatNumber(value)}
      </span>
    </span>
  );
}
