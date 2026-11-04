import { type Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'catalogo' },
  {
    path: 'catalogo',
    loadComponent: () => import('./features/catalog/pages/catalog.page').then((m) => m.CatalogPage),
  },
  {
    path: 'catalogo/:slug',
    loadComponent: () => import('./features/catalog/pages/detail.page').then((m) => m.DetailPage),
  },
  {
    path: 'favoritos',
    loadComponent: () =>
      import('./features/favorites/pages/favorites.page').then((m) => m.FavoritesPage),
  },
  {
    path: 'calendario',
    loadComponent: () =>
      import('./features/calendar/pages/calendar.page').then((m) => m.CalendarPage),
  },
  {
    path: 'analises',
    loadComponent: () =>
      import('./features/analytics/pages/analytics.page').then((m) => m.AnalyticsPage),
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./features/admin/pages/admin-login.page').then((m) => m.AdminLoginPage),
  },
  {
    path: 'admin/monitoramento',
    loadComponent: () =>
      import('./features/admin/pages/import-monitoring.page').then((m) => m.ImportMonitoringPage),
  },
  { path: '**', redirectTo: 'catalogo' },
];
