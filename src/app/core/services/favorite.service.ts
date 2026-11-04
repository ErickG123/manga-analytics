import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY = 'manga_atlas_favorite_ids';

@Injectable({
  providedIn: 'root',
})
export class FavoriteService {
  private readonly _favoriteIds = signal<string[]>(this.loadFromStorage());

  readonly favoriteIds = this._favoriteIds.asReadonly();
  readonly count = computed(() => this._favoriteIds().length);

  isFavorite(mangaId: string): boolean {
    return this._favoriteIds().includes(mangaId);
  }

  toggleFavorite(mangaId: string): void {
    const current = this._favoriteIds();
    let updated: string[];

    if (current.includes(mangaId)) {
      updated = current.filter((id) => id !== mangaId);
    } else {
      updated = [...current, mangaId];
    }

    this._favoriteIds.set(updated);
    this.saveToStorage(updated);
  }

  addFavorite(mangaId: string): void {
    if (!this.isFavorite(mangaId)) {
      const updated = [...this._favoriteIds(), mangaId];
      this._favoriteIds.set(updated);
      this.saveToStorage(updated);
    }
  }

  removeFavorite(mangaId: string): void {
    if (this.isFavorite(mangaId)) {
      const updated = this._favoriteIds().filter((id) => id !== mangaId);
      this._favoriteIds.set(updated);
      this.saveToStorage(updated);
    }
  }

  clearFavorites(): void {
    this._favoriteIds.set([]);
    this.saveToStorage([]);
  }

  private loadFromStorage(): string[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return [];
      }
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(ids: string[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
      }
    } catch (err) {
      console.warn('Não foi possível persistir favoritos no localStorage:', err);
    }
  }
}
