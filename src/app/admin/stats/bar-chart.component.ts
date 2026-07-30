import { Component, Input } from '@angular/core';
import { ChartPoint, niceMax } from './chart.model';

/**
 * Graphique à barres mono-série (colonnes verticales ou barres horizontales).
 *
 * Mono-série volontairement : les catégories sont nominales (prestations,
 * mois, heures), toutes les barres portent donc la même teinte. Colorer chaque
 * barre selon sa valeur ré-encoderait ce que la longueur dit déjà, et dépenserait
 * le canal identité pour rien.
 *
 * Pas de légende : une seule série, le titre du panneau dit ce qui est tracé.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [],
  template: `
    @if (!points.length) {
      <p class="chart-empty">{{ emptyMessage }}</p>
    } @else {
      <div class="chart" [class.horizontal]="horizontal">
        @if (!horizontal) {
          <div class="y-axis">
            @for (tick of ticks; track tick) {
              <span class="tick">{{ format(tick) }}</span>
            }
          </div>
        }

        <div class="plot">
          @if (!horizontal) {
            @for (tick of ticks; track tick) {
              <span class="gridline" [style.bottom.%]="(tick / axisMax) * 100"></span>
            }
          }

          <div class="bars">
            @for (point of points; track point.label; let i = $index) {
              <div
                class="band"
                (mouseenter)="hovered = i"
                (mouseleave)="hovered = null"
                (focus)="hovered = i"
                (blur)="hovered = null"
                tabindex="0"
                [attr.aria-label]="(point.fullLabel || point.label) + ' : ' + format(point.value)">

                @if (hovered === i) {
                  <div class="tooltip" role="tooltip">
                    <strong>{{ point.fullLabel || point.label }}</strong>
                    <span>{{ format(point.value) }}</span>
                  </div>
                }

                <div class="bar-track">
                  <div
                    class="bar"
                    [class.is-hovered]="hovered === i"
                    [style.height.%]="horizontal ? null : sizeOf(point)"
                    [style.width.%]="horizontal ? sizeOf(point) : null">
                  </div>
                  @if (isLabelled(i)) {
                    <span class="bar-value">{{ format(point.value) }}</span>
                  }
                </div>

                <span class="band-label">{{ point.label }}</span>
              </div>
            }
          </div>
        </div>
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
      --baseline: #c3c2b7;

      display: block;
      font-variant-numeric: tabular-nums;
    }

    .chart-empty {
      padding: 2rem 0;
      text-align: center;
      font-size: 0.88rem;
      color: var(--text-muted);
    }

    .chart {
      display: flex;
      gap: 0.6rem;
    }

    .y-axis {
      display: flex;
      flex-direction: column-reverse;
      justify-content: space-between;
      height: 220px;
      padding-bottom: 1.5rem;
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
    }

    /* Hairline 1px pleine, volontairement discrète — jamais en pointillés */
    .gridline {
      position: absolute;
      left: 0;
      right: 0;
      height: 1px;
      background: var(--gridline);
      margin-bottom: 1.5rem;
    }

    .bars {
      position: relative;
      display: flex;
      align-items: flex-end;
      gap: 0.35rem;
      height: 220px;
    }

    .band {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      height: 100%;
      outline: none;
    }

    .band:focus-visible .bar { outline: 2px solid var(--series-1); outline-offset: 2px; }

    .bar-track {
      position: relative;
      flex: 1;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      border-bottom: 1px solid var(--baseline);
    }

    /* Extrémité data arrondie 4px, carrée sur la ligne de base */
    .bar {
      width: 100%;
      max-width: 24px;
      background: var(--series-1);
      border-radius: 4px 4px 0 0;
      transition: opacity 0.15s ease;
      min-height: 2px;
    }

    .bar.is-hovered { opacity: 0.82; }

    .bar-value {
      position: absolute;
      bottom: calc(100% + 2px);
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .band-label {
      height: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.68rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
    }

    .tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
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

    .tooltip strong { font-weight: 600; }

    /* --- Barres horizontales (catégories à noms longs) --- */

    .chart.horizontal .bars {
      flex-direction: column;
      align-items: stretch;
      height: auto;
      gap: 0.55rem;
    }

    .chart.horizontal .band {
      flex-direction: row;
      align-items: center;
      gap: 0.6rem;
      height: auto;
    }

    .chart.horizontal .band-label {
      order: -1;
      width: 40%;
      max-width: 190px;
      justify-content: flex-start;
      text-align: left;
      height: auto;
      font-size: 0.78rem;
      color: var(--text-secondary);
      text-overflow: ellipsis;
    }

    .chart.horizontal .bar-track {
      flex: 1;
      align-items: center;
      justify-content: flex-start;
      border-bottom: none;
      border-left: 1px solid var(--baseline);
      height: 20px;
    }

    .chart.horizontal .bar {
      height: 100%;
      max-width: none;
      max-height: 24px;
      border-radius: 0 4px 4px 0;
    }

    .chart.horizontal .bar-value {
      position: static;
      transform: none;
      margin-left: 0.5rem;
    }

    .chart.horizontal .tooltip {
      bottom: auto;
      top: -0.4rem;
      left: 45%;
    }

    /* --- Vue tableau (canal de secours, toujours disponible) --- */

    .data-table {
      margin-top: 1rem;
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
export class BarChartComponent {
  @Input() points: ChartPoint[] = [];
  @Input() horizontal = false;
  @Input() emptyMessage = 'Aucune donnée sur cette période.';
  @Input() categoryHeader = 'Catégorie';
  @Input() valueHeader = 'Valeur';
  /** Formatage des valeurs (montants, entiers…) */
  @Input() formatter: (value: number) => string = value => `${value}`;

  hovered: number | null = null;

  get axisMax(): number {
    return niceMax(Math.max(...this.points.map(p => p.value), 0));
  }

  get ticks(): number[] {
    const max = this.axisMax;
    return [0, max / 2, max];
  }

  sizeOf(point: ChartPoint): number {
    return this.axisMax === 0 ? 0 : (point.value / this.axisMax) * 100;
  }

  /**
   * Étiquetage sélectif : uniquement le maximum et le dernier point. Une valeur
   * sur chaque barre devient du bruit et n'est pas lue.
   */
  isLabelled(index: number): boolean {
    if (!this.points.length) return false;
    const max = Math.max(...this.points.map(p => p.value));
    const isMax = this.points[index].value === max && max > 0;
    const isLast = index === this.points.length - 1;
    return isMax || isLast;
  }

  format(value: number): string {
    return this.formatter(value);
  }
}
