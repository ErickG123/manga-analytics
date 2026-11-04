import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CalendarService } from '../../services/calendar.service';
import type { CalendarEntry } from '../../models/calendar-entry.model';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, FormsModule],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent {
  private readonly calendarService = inject(CalendarService);

  readonly allEntries = signal<CalendarEntry[]>([]);
  readonly selectedPublisher = signal<string>('');
  readonly selectedStatus = signal<string>('');

  readonly entries = computed(() => {
    return this.allEntries().filter((e) => {
      const entryWithPub = e as CalendarEntry & { publisher?: string };
      const matchPub =
        !this.selectedPublisher() || entryWithPub.publisher === this.selectedPublisher();
      const matchStatus = !this.selectedStatus() || e.status === this.selectedStatus();
      return matchPub && matchStatus;
    });
  });

  readonly publishers = computed(() => {
    const pubs = this.allEntries()
      .map((e) => (e as CalendarEntry & { publisher?: string }).publisher)
      .filter((p): p is string => Boolean(p));
    return [...new Set(pubs)].sort();
  });

  constructor() {
    void this.calendarService.getReleases().then((res) => {
      this.allEntries.set(res);
    });
  }
}
