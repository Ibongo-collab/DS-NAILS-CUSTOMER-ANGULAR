import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../admin.service';
import { OpeningHours } from '../../models/booking.model';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

interface DayRow {
  source: OpeningHours;
  label: string;
  start_time: string;
  end_time: string;
  is_closed: boolean;
}

@Component({
  selector: 'app-admin-opening-hours',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-opening-hours.component.html',
  styleUrls: ['./admin-opening-hours.component.scss']
})
export class AdminOpeningHoursComponent implements OnInit {
  loading = true;
  error = '';
  success = '';
  rows: DayRow[] = [];
  busyId: string | null = null;

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading = true;

    const hours = await this.adminService.getOpeningHours();
    this.rows = hours
      .filter(h => h.day_of_week >= 1 && h.day_of_week <= 7)
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .map(h => ({
        source: h,
        label: DAY_NAMES[h.day_of_week - 1],
        // Postgres renvoie « 09:00:00 », <input type="time"> attend « 09:00 »
        start_time: (h.start_time || '').slice(0, 5),
        end_time: (h.end_time || '').slice(0, 5),
        is_closed: h.is_closed
      }));

    this.loading = false;
    this.cdr.detectChanges();
  }

  isDirty(row: DayRow): boolean {
    return (
      row.is_closed !== row.source.is_closed ||
      row.start_time !== (row.source.start_time || '').slice(0, 5) ||
      row.end_time !== (row.source.end_time || '').slice(0, 5)
    );
  }

  private isValid(row: DayRow): boolean {
    if (row.is_closed) return true;
    if (!row.start_time || !row.end_time) return false;
    return row.start_time < row.end_time;
  }

  canSave(row: DayRow): boolean {
    return this.isDirty(row) && this.isValid(row) && this.busyId !== row.source.id;
  }

  async save(row: DayRow): Promise<void> {
    if (!this.isValid(row)) {
      this.error = `${row.label} : l'heure de fermeture doit être postérieure à l'heure d'ouverture.`;
      return;
    }

    this.busyId = row.source.id;
    this.error = '';
    this.success = '';
    this.cdr.detectChanges();

    const result = await this.adminService.updateOpeningHours(row.source.id, {
      start_time: row.start_time,
      end_time: row.end_time,
      is_closed: row.is_closed
    });

    this.busyId = null;

    if (!result.success) {
      this.error = result.error || 'La modification a échoué.';
      this.cdr.detectChanges();
      return;
    }

    this.success = `${row.label} mis à jour.`;
    await this.load(false);
  }

  reset(row: DayRow): void {
    row.start_time = (row.source.start_time || '').slice(0, 5);
    row.end_time = (row.source.end_time || '').slice(0, 5);
    row.is_closed = row.source.is_closed;
  }
}
