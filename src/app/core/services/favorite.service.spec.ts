import { describe, it, expect, beforeEach } from 'vitest';
import { FavoriteService } from './favorite.service';

describe('FavoriteService', () => {
  let service: FavoriteService;

  beforeEach(() => {
    localStorage.clear();
    service = new FavoriteService();
  });

  it('deve inicializar vazio se localStorage não contiver favoritos', () => {
    expect(service.favoriteIds()).toEqual([]);
    expect(service.count()).toBe(0);
  });

  it('deve adicionar um favorito e atualizar o signal e localStorage', () => {
    service.toggleFavorite('manga-123');
    expect(service.isFavorite('manga-123')).toBe(true);
    expect(service.count()).toBe(1);
    expect(localStorage.getItem('manga_atlas_favorite_ids')).toContain('manga-123');
  });

  it('deve remover um favorito ao alternar novamente', () => {
    service.toggleFavorite('manga-123');
    expect(service.isFavorite('manga-123')).toBe(true);

    service.toggleFavorite('manga-123');
    expect(service.isFavorite('manga-123')).toBe(false);
    expect(service.count()).toBe(0);
  });

  it('deve limpar todos os favoritos', () => {
    service.addFavorite('manga-1');
    service.addFavorite('manga-2');
    expect(service.count()).toBe(2);

    service.clearFavorites();
    expect(service.count()).toBe(0);
    expect(service.favoriteIds()).toEqual([]);
  });
});
