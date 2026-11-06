import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { AdminAuthService } from '../../../../core/services/admin-auth.service';
import { ImportMonitoringComponent } from './import-monitoring.component';

describe('ImportMonitoringComponent', () => {
  let fixture: ComponentFixture<ImportMonitoringComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportMonitoringComponent],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AdminAuthService,
          useValue: { token: () => 'admin-token', isAuthenticated: () => true, logout: vi.fn() },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportMonitoringComponent);
  });

  afterEach(() => httpTesting.verify());

  it('asks for confirmation in a PrimeNG dialog before resetting the checkpoint', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const confirm = vi.spyOn(confirmation, 'confirm');

    fixture.componentInstance.startBackfill(true);

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'collector-reset-confirmation',
        header: 'Recomeçar do início?',
        acceptLabel: 'Recomeçar coleta',
        rejectLabel: 'Cancelar',
      }),
    );
    httpTesting.expectNone((request) => request.url.endsWith('/collector/backfill/start'));
  });

  it('starts the checkpoint reset only after the dialog is accepted', () => {
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    const confirm = vi.spyOn(confirmation, 'confirm');

    fixture.componentInstance.startBackfill(true);
    const options = confirm.mock.calls[0]?.[0];
    options?.accept?.();

    const request = httpTesting.expectOne((req) => req.url.endsWith('/collector/backfill/start'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ resetCheckpoint: true, forceReparse: true });
    request.flush({ message: 'Coleta iniciada.' });
    for (const pending of httpTesting.match(() => true)) pending.flush({});
  });
});
