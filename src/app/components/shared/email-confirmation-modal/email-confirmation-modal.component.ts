import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-email-confirmation-modal',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './email-confirmation-modal.component.html',
  styleUrls: ['./email-confirmation-modal.component.scss']
})
export class EmailConfirmationModalComponent {
  /** Adresse saisie à l'inscription, rappelée au client. */
  @Input() email = '';
  @Output() closed = new EventEmitter<void>();

  close(): void {
    this.closed.emit();
  }
}
