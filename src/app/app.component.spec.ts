import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('deve ser instanciado com sucesso', () => {
    expect(component).toBeTruthy();
  });

  it('deve conter a navegação com links para catálogo, favoritos, calendário, análises e admin', () => {
    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav).toBeTruthy();
    const links = Array.from(nav.querySelectorAll('a')).map((a) =>
      (a as HTMLAnchorElement).textContent?.trim(),
    );
    expect(links).toEqual(['Catálogo', 'Favoritos', 'Calendário', 'Análises', 'Admin']);
  });
});
