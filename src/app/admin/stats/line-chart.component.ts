import { Component, Input } from '@angular/core';
import { ChartPoint, niceMax } from './chart.model';

/**
 * Courbe d'évolution mono-série, avec repère vertical et infobulle au survol.
 * Trait 2px, aplat de la même teinte à 10 % — un lavis, jamais un bloc saturé.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [],
  template: `
    @if (points.length < 2) {
      <p class="chart-empty">{{ emptyMessage }}</p>
    } @else {
      <div class="chart">
        <div class="y-axis">
          @for (tick of ticks; track tick) {
            <span class="tick">{{ format(tick) }}</span>
          }
        </div>

        <div
          class="plot"
          (mousemove)="onMove($event)"
          (mouseleave)="hovered = null">

          <svg
            [attr.viewBox]="'0 0 ' + width + ' ' + height"
            preserveAspectRatio="none"
            class="canvas"
            role="img"
            [attr.aria-label]="ariaLabel">
            @for (tick of ticks; track tick) {
              <line
                class="gridline"
                x1="0" [attr.y1]="yOf(tick)"
                [attr.x2]="width" [attr.y2]="yOf(tick)"
                vector-effect="non-scaling-stroke" />
            }

            <polygon class="area" [attr.points]="areaPoints" />
            <polyline class="line" [attr.points]="linePoints" vector-effect="non-scaling-stroke" />
          </svg>

          @if (hovered !== null) {
            <span class="crosshair" [style.left.%]="xPercent(hovered)"></span>
            <span
              class="marker"
              [style.left.%]="xPercent(hovered)"
              [style.top.%]="yPercent(hovered)"></span>
            <div
              class="tooltip"
              [style.left.%]="xPercent(hovered)"
              [class.flip]="xPercent(hovered) > 65"
              role="tooltip">
              <strong>{{ points[hovered].fullLabel || points[hovered].label }}</strong>
              <span>{{ format(points[hovered].value) }}</span>
            </div>
          }
        </div>
      </div>

      <div class="x-axis">
        @for (label of edgeLabels; track label.index) {
          <span class="x-label" [style.left.%]="xPercent(label.index)">{{ label.text }}</span>
        }
      </div>

      <details class="data-table">
        <summary>Voir les données</summary>
        <table>
          <thead>
            <tr><th>{{ categoryHeader }}</th><th>{{ valueHeader }}</th></tr>
          </thead>
          <tbody>
            @for (point of points; track point.label) {
              <tr>
                <td>{{ point.fullLabel || point.label }}</td>
                <td class="num">{{ format(point.value) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </details>
    }
  `,
  styles: [`
    :host {
      --series-1: #96177F;
      --surface-1: #ffffff;
      --text-secondary: #52514e;
      --text-muted: #898781;
      --gridline: #e1e0d9;

      display: block;
      font-variant-numeric: tabular-nums;
    }

    .chart-empty {
      padding: 2rem 0;
      text-align: center;
      font-size: 0.88rem;
      color: var(--text-muted);
    }

    .chart { display: flex; gap: 0.6rem; }

    .y-axis {
      display: flex;
      flex-direction: column-reverse;
      justify-content: space-between;
      height: 220px;
      font-size: 0.7rem;
      color: var(--text-muted);
      text-align: right;
      min-width: 34px;
    }

    .tick { transform: translateY(50%); }

    .plot {
      position: relative;
      flex: 1;
      min-width: 0;
      height: 220px;
    }

    .canvas {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }

    .gridline { stroke: var(--gridline); stroke-width: 1; }

    /* Lavis à 10 % de la teinte de série */
    .area { fill: var(--series-1); opacity: 0.1; }

    .line {
      fill: none;
      stroke: var(--series-1);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }

    .crosshair {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--text-muted);
      opacity: 0.45;
      pointer-events: none;
    }

    /* Marqueur ≥ 8px, cerclé de 2px en couleur de surface pour rester lisible */
    .marker {
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--series-1);
      box-shadow: 0 0 0 2px var(--surface-1);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .tooltip {
      position: absolute;
      top: 0.25rem;
      transform: translateX(-50%);
      z-index: 5;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.45rem 0.6rem;
      border-radius: 8px;
      background: #2A2A2A;
      color: #fff;
      font-size: 0.75rem;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
    }

    .tooltip.flip { transform: translateX(-90%); }
    .tooltip strong { font-weight: 600; }

    .x-axis {
      position: relative;
      height: 1.25rem;
      margin-left: calc(34px + 0.6rem);
    }

    .x-label {
      position: absolute;
      transform: translateX(-50%);
      font-size: 0.68rem;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .data-table {
      margin-top: 0.5rem;
      font-size: 0.8rem;
    }

    .data-table summary {
      cursor: pointer;
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 0.75rem;
    }

    .data-table table {
      width: 100%;
      margin-top: 0.6rem;
      border-collapse: collapse;
    }

    .data-table th,
    .data-table td {
      padding: 0.35rem 0.5rem;
      border-bottom: 1px solid var(--gridline);
      text-align: left;
      color: var(--text-secondary);
    }

    .data-table .num { text-align: right; }
  `]
})
export class LineChartComponent {
  @Input() points: ChartPoint[] = [];
  @Input() emptyMessage = 'Pas assez de données pour tracer une courbe.';
  @Input() ariaLabel = 'Courbe d\'évolution';
  @Input() categoryHeader = 'Date';
  @Input() valueHeader = 'Valeur';
  @Input() formatter: (value: number) => string = value => `${value}`;

  readonly width = 720;
  readonly height = 220;

  hovered: number | null = null;

  get axisMax(): number {
    return niceMax(Math.max(...this.points.map(p => p.value), 0));
  }

  get ticks(): number[] {
    const max = this.axisMax;
    return [0, max / 2, max];
  }

  private xOf(index: number): number {
    if (this.points.length < 2) return 0;
    return (index / (this.points.length - 1)) * this.width;
  }

  yOf(value: number): number {
    const max = this.axisMax;
    return max === 0 ? this.height : this.height - (value / max) * this.height;
  }

  get linePoints(): string {
    return this.points.map((p, i) => `${this.xOf(i)},${this.yOf(p.value)}`).join(' ');
  }

  get areaPoints(): string {
    if (this.points.length < 2) return '';
    return `0,${this.height} ${this.linePoints} ${this.width},${this.height}`;
  }

  xPercent(index: number): number {
    if (this.points.length < 2) return 0;
    return (index / (this.points.length - 1)) * 100;
  }

  yPercent(index: number): number {
    return (this.yOf(this.points[index].value) / this.height) * 100;
  }

  /** Premier, milieu et dernier seulement : au-delà les libellés se chevauchent. */
  get edgeLabels(): { index: number; text: string }[] {
    const last = this.points.length - 1;
    if (last < 1) return [];
    const indexes = last <= 2 ? [0, last] : [0, Math.round(last / 2), last];
    return [...new Set(indexes)].map(index => ({ index, text: this.points[index].label }));
  }

  onMove(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (this.points.length - 1));
    this.hovered = Math.min(Math.max(index, 0), this.points.length - 1);
  }

  format(value: number): string {
    return this.formatter(value);
  }
}
