import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../admin.service';
import { BlockedSlot } from '../../models/booking.model';
import { parseDateString, todayString } from '../../utils/date';

@Component({
  selector: 'app-admin-blocked-slots',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-blocked-slots.component.html',
  styleUrls: ['./admin-blocked-slots.component.scss']
})
export class AdminBlockedSlotsComponent implements OnInit {
  loading = true;
  error = '';
  slots: BlockedSlot[] = [];

  creating = false;
  busyId: string | null = null;

  draft = { date: '', start_time: '', end_time: '', reason: '' };

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.loading = true;
    this.slots = await this.adminService.getBlockedSlots();
    this.loading = false;
    this.cdr.detectChanges();
  }

  get canCreate(): boolean {
    return (
      !!this.draft.date &&
      !!this.draft.start_time &&
      !!this.draft.end_time &&
      this.draft.start_time < this.draft.end_time
    );
  }

  async create(): Promise<void> {
    if (!this.canCreate) {
      this.error = 'L\'heure de fin doit être postérieure à l\'heure de début.';
      return;
    }

    this.creating = true;
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.adminService.createBlockedSlot({
      date: this.draft.date,
      start_time: this.draft.start_time,
      end_time: this.draft.end_time,
      reason: this.draft.reason.trim() || null
    });

    this.creating = false;

    if (!result.success) {
      this.error = result.error || 'La création a échoué.';
      this.cdr.detectChanges();
      return;
    }

    this.draft = { date: '', start_time: '', end_time: '', reason: '' };
    await this.load(false);
  }

  async remove(slot: BlockedSlot): Promise<void> {
    if (!confirm(`Supprimer l'indisponibilité du ${this.formatDate(slot.date)} ?`)) return;

    this.busyId = slot.id;
    this.error = '';
    this.cdr.detectChanges();

    const result = await this.adminService.deleteBlockedSlot(slot.id);
    this.busyId = null;

    if (!result.success) {
      this.error = result.error || 'La suppression a échoué.';
      this.cdr.detectChanges();
      return;
    }
    await this.load(false);
  }

  isPast(slot: BlockedSlot): boolean {
    return slot.date < todayString();
  }

  formatDate(dateString: string): string {
    const date = parseDateString(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  formatTime(time: string): string {
    return (time || '').slice(0, 5);
  }
}
