import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalendarPageComponent } from './calendar.page';
import { CalendarService } from '../../services/calendar.service';
import type { CalendarEntry } from '../../models/calendar-entry.model';
import type {
  CalendarFilters,
  CalendarReleaseMonthSummary,
  CalendarResult,
} from '../../models/calendar-query.model';

describe('CalendarPageComponent', () => {
  registerLocaleData(localePt, 'pt-BR');
  let fixture: ComponentFixture<CalendarPageComponent>;
  let calendarServiceMock: {
    getPublishers: () => Promise<{ name: string; slug: string }[]>;
    getReleases: (filters?: CalendarFilters) => Promise<CalendarResult>;
    getReleaseSummary: (filters?: CalendarFilters) => Promise<CalendarReleaseMonthSummary[]>;
  };

  beforeEach(async () => {
    calendarServiceMock = {
      getPublishers: async () => [],
      getReleases: async () => ({
        data: [],
        pagination: { page: 1, limit: 24, total: 25, totalPages: 2 },
      }),
      getReleaseSummary: async () => [],
    };
    await TestBed.configureTestingModule({
      imports: [CalendarPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: CalendarService,
          useValue: calendarServiceMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows one pagination control in list mode and month navigation only in month mode', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.pagination')).not.toBeNull();
    expect(element.querySelector('.month-navigation')).toBeNull();

    fixture.componentInstance.viewMode.set('month');
    fixture.detectChanges();

    expect(element.querySelector('.pagination')).not.toBeNull();
    expect(element.querySelector('.month-navigation')).not.toBeNull();
  });

  it('loads month entries only after expanding the timeline month', async () => {
    const component = fixture.componentInstance;
    const year = component.selectedYear();
    const month = component.selectedMonth();
    component.timelineYearFrom.set(year);
    component.timelineYearTo.set(year);
    component.selectedMonth.set(0);
    const entry: CalendarEntry = {
      id: 'release-1',
      slug: 'obra-exemplo',
      title: 'Obra de exemplo',
      number: 3,
      publisher: 'Editora exemplo',
      date: `15/${String(month).padStart(2, '0')}/${year}`,
      precision: 'day',
      year,
      month,
      day: 15,
      status: 'planned',
      price: 49.9,
      coverUrl: 'https://example.test/cover.jpg',
    };
    component.timelineSummary.set([
      { year, month, count: 1, key: `${year}-${String(month).padStart(2, '0')}`, label: 'abril' },
    ]);
    calendarServiceMock.getReleases = async (filters) => {
      expect(filters?.year).toBe(year);
      expect(filters?.month).toBe(month);
      return {
        data: [entry],
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
      };
    };
    component.viewMode.set('timeline');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.timeline-year-marker')?.textContent?.trim()).toBe(String(year));
    const toggle = element.querySelector('.timeline-month-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.timeline-card')).toBeNull();

    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      (element.querySelector('.timeline-month-toggle') as HTMLButtonElement).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
    expect(element.querySelector('.timeline-card h4')?.textContent).toContain('Obra de exemplo');
    expect(element.querySelector('.timeline-cover img')?.getAttribute('src')).toBe(
      'https://example.test/cover.jpg',
    );
  });
});
