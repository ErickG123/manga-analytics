import { TestBed } from '@angular/core/testing';
import { MockMangaRepository, MANGA_REPOSITORY } from './manga.repository';
import type { MangaRepository } from '../models/manga-repository.model';

describe('MockMangaRepository', () => {
  let repository: MangaRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MockMangaRepository],
    });
    repository = TestBed.inject(MockMangaRepository);
  });

  it('deve ser instanciado via TestBed', () => {
    expect(repository).toBeTruthy();
  });

  it('deve listar todas as obras cadastradas no mock', async () => {
    const list = await repository.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((m) => m.slug === 'one-piece-aventura-escolar')).toBe(true);
  });

  it('deve encontrar uma obra pelo slug correspondente', async () => {
    const item = await repository.findBySlug('one-piece-aventura-escolar');
    expect(item).toBeDefined();
    expect(item?.title).toBe('One Piece Aventura Escolar');
  });

  it('deve retornar undefined ao pesquisar um slug inexistente', async () => {
    const item = await repository.findBySlug('slug-inexistente-xyz');
    expect(item).toBeUndefined();
  });

  it('deve resolver o token MANGA_REPOSITORY', () => {
    const fromToken = TestBed.inject(MANGA_REPOSITORY);
    expect(fromToken).toBeDefined();
    expect(typeof fromToken.list).toBe('function');
  });
});
