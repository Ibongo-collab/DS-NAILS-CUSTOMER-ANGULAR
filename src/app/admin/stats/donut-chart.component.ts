import { Component, Input } from '@angular/core';

export interface DonutSegment {
  label: string;
  value: number;
  /** Teinte issue de la palette validée — jamais choisie à l'œil */
  color: string;
}

interface RenderedSegment extends DonutSegment {
  index: number;
  share: number;
  dash: number;
  gap: number;
  offset: number;
}

/**
 * Répartition en anneau.
 *
 * Chaque part porte son effectif et son pourcentage en clair, et un dépliant
 * « Voir les données » double le graphique : la couleur ne porte jamais seule
 * l'information — c'est ce qui autorise la teinte jaune, en deçà du contraste
 * de 3:1 sur fond blanc.
 */
@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [],
  template: `
    @if (total === 0) {
      <p class="chart-empty">{{ emptyMessage }}</p>
    } @else {
      <div class="donut-layout">
        <div class="donut-wrap">
          <svg viewBox="0 0 200 200" class="donut" role="img" [attr.aria-label]="ariaLabel">
            @for (segment of rendered; track segment.label) {
              <circle
                class="arc"
                [class.dimmed]="hovered !== null && hovered !== segment.index"
                cx="100" cy="100" [attr.r]="radius"
                fill="none"
                [attr.stroke]="segment.color"
                [attr.stroke-width]="thickness"
                [attr.stroke-dasharray]="segment.dash + ' ' + (circumference - segment.dash)"
                [attr.stroke-dashoffset]="segment.offset"
                (mouseenter)="hovered = segment.index"
                (mouseleave)="hovered = null" />
            }
          </svg>

          <div class="donut-center">
            @if (hovered !== null) {
              <span class="center-value">{{ rendered[hovered].value }}</span>
              <span class="center-label">{{ rendered[hovered].label }}</span>
            } @else {
              <span class="center-value">{{ total }}</span>
              <span class="center-label">{{ totalLabel }}</span>
            }
          </div>
        </div>

        <ul class="legend">
          @for (segment of rendered; track segment.label) {
            <li
              class="legend-item"
              [class.dimmed]="hovered !== null && hovered !== segment.index"
              (mouseenter)="hovered = segment.index"
              (mouseleave)="hovered = null">
              <span class="swatch" [style.background]="segment.color"></span>
              <span class="legend-label">{{ segment.label }}</span>
              <span class="legend-value">
                {{ segment.value }} · {{ percent(segment.share) }}
              </span>
            </li>
          }
        </ul>
      </div>

      <details class="data-table">
        <summary>Voir les données</summary>
        <table>
          <thead>
            <tr><th>Civilité</th><th class="num">Clients</th><th class="num">Part</th></tr>
          </thead>
          <tbody>
            @for (segment of rendered; track segment.label) {
              <tr>
                <td>{{ segment.label }}</td>
                <td class="num">{{ segment.value }}</td>
                <td class="num">{{ percent(segment.share) }}</td>
              </tr>
            }
            <tr class="total-row">
              <td>Total</td>
              <td class="num">{{ total }}</td>
              <td class="num">100 %</td>
            </tr>
          </tbody>
        </table>
      </details>
    }
  `,
  styles: [`
    :host {
      --surface-1: #ffffff;
      --text-primary: #0b0b0b;
      --text-secondary: #52514e;
      --text-muted: #898781;
      --gridline: #e1e0d9;

      display: block;
    }

    .chart-empty {
      padding: 2rem 0;
      text-align: center;
      font-size: 0.88rem;
      color: var(--text-muted);
    }

    .donut-layout {
      display: flex;
      align-items: center;
      gap: 2rem;
      flex-wrap: wrap;
    }

    .donut-wrap {
      position: relative;
      width: 200px;
      height: 200px;
      flex-shrink: 0;
    }

    .donut {
      width: 100%;
      height: 100%;
      /* Départ à midi plutôt qu'à 3 h */
      transform: rotate(-90deg);
    }

    .arc {
      transition: opacity 0.15s ease;
      cursor: pointer;
    }

    .arc.dimmed { opacity: 0.35; }

    .donut-center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      text-align: center;
    }

    .center-value {
      font-size: 2rem;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.1;
    }

    .center-label {
      margin-top: 0.15rem;
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      max-width: 110px;
    }

    .legend {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
      min-width: 190px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.88rem;
      cursor: pointer;
      transition: opacity 0.15s ease;
    }

    .legend-item.dimmed { opacity: 0.45; }

    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    /* Le texte reste en encre : la couleur vit dans la pastille, jamais dans les mots */
    .legend-label {
      color: var(--text-secondary);
      flex: 1;
    }

    .legend-value {
      color: var(--text-primary);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .data-table {
      margin-top: 1.25rem;
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

    .data-table .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .total-row td {
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: none;
    }

    @media (max-width: 520px) {
      .donut-layout { gap: 1.25rem; justify-content: center; }
      .legend { min-width: 100%; }
    }
  `]
})
export class DonutChartComponent {
  @Input() segments: DonutSegment[] = [];
  @Input() totalLabel = 'au total';
  @Input() emptyMessage = 'Aucune donnée à représenter.';
  @Input() ariaLabel = 'Répartition';

  readonly radius = 70;
  readonly thickness = 26;
  /** Écart en unités du viewBox, qui joue le rôle des 2px de surface entre parts */
  private readonly gapUnits = 2;

  hovered: number | null = null;

  get circumference(): number {
    return 2 * Math.PI * this.radius;
  }

  get total(): number {
    return this.segments.reduce((sum, s) => sum + (s.value || 0), 0);
  }

  /** Parts non nulles uniquement : une part à zéro n'a rien à dessiner. */
  get rendered(): RenderedSegment[] {
    const visible = this.segments.filter(s => s.value > 0);
    const total = this.total;
    if (!visible.length || total === 0) return [];

    // Une seule part : pas d'écart, sinon l'anneau porterait une encoche isolée
    const gap = visible.length > 1 ? this.gapUnits : 0;

    let consumed = 0;
    return visible.map((segment, index) => {
      const share = segment.value / total;
      const arc = share * this.circumference;
      const dash = Math.max(arc - gap, 0.5);
      const offset = -consumed;
      consumed += arc;

      return { ...segment, index, share, dash, gap, offset };
    });
  }

  percent(share: number): string {
    return `${(share * 100).toFixed(share * 100 < 10 ? 1 : 0).replace('.', ',')} %`;
  }
}
