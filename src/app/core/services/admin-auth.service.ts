import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { type Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AdminLoginResponse } from '../models/admin-login-response.model';

const SESSION_STORAGE_KEY = 'manga_atlas_admin_token';

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly adminApiUrl = environment.adminApiUrl;
  private readonly _token = signal<string | null>(this.loadToken());

  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  login(password: string): Observable<AdminLoginResponse> {
    return this.http.post<AdminLoginResponse>(`${this.adminApiUrl}/auth/login`, { password }).pipe(
      tap((res) => {
        if (res?.token) {
          this._token.set(res.token);
          this.saveToken(res.token);
        }
      }),
    );
  }

  logout(): void {
    const currentToken = this._token();
    if (currentToken) {
      this.http.post(`${this.adminApiUrl}/auth/logout`, { token: currentToken }).subscribe({
        next: () => {
          /* noop */
        },
        error: () => {
          /* noop */
        },
      });
    }
    this._token.set(null);
    this.removeToken();
  }

  private loadToken(): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return sessionStorage.getItem(SESSION_STORAGE_KEY);
      }
    } catch {
      return null;
    }
    return null;
  }

  private saveToken(token: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, token);
      }
    } catch (err) {
      console.warn('Erro ao salvar token de sessão na sessionStorage:', err);
    }
  }

  private removeToken(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignora erro
    }
  }
}
