import {
  Component, forwardRef, ChangeDetectorRef,
  ElementRef, Input, Output, EventEmitter, HostListener
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { COUNTRIES, Country, getFlag } from '../../../data/countries';

@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [FormsModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => PhoneInputComponent),
    multi: true
  }],
  templateUrl: './phone-input.component.html',
  styleUrls: ['./phone-input.component.scss']
})
export class PhoneInputComponent implements ControlValueAccessor {
  readonly countries = COUNTRIES;
  readonly getFlag = getFlag;

  selectedCountry: Country = COUNTRIES.find(c => c.iso === 'SN')!;
  localNumber = '';
  isOpen = false;
  searchTerm = '';
  isDisabled = false;

  @Input() hasError = false;
  @Output() phoneBlur = new EventEmitter<void>();

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen = false;
      this.searchTerm = '';
      this.cdr.detectChanges();
    }
  }

  get filteredCountries(): Country[] {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.countries;
    return this.countries.filter(c =>
      c.name.toLowerCase().includes(term) || c.dialCode.includes(term)
    );
  }

  // ControlValueAccessor

  writeValue(value: string): void {
    if (!value) { this.localNumber = ''; return; }
    const match = value.match(/^\+(\d+)\s?(.*)$/);
    if (match) {
      const dialCode = match[1];
      const country = this.countries
        .filter(c => dialCode.startsWith(c.dialCode))
        .sort((a, b) => b.dialCode.length - a.dialCode.length)[0];
      if (country) this.selectedCountry = country;
      this.localNumber = match[2] || '';
    }
    this.cdr.detectChanges();
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.isDisabled = isDisabled; }

  emit(): void {
    const local = this.localNumber.trim();
    this.onChange(local ? `+${this.selectedCountry.dialCode} ${local}` : '');
  }

  selectCountry(country: Country): void {
    this.selectedCountry = country;
    this.isOpen = false;
    this.searchTerm = '';
    this.emit();
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
    if (!this.isOpen) this.searchTerm = '';
  }

  onNumberBlur(): void {
    this.onTouched();
    this.phoneBlur.emit();
  }
}
