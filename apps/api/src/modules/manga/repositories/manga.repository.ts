import { AppDataSource } from '../../../config/data-source.js';
import { Manga } from '../../../entities/index.js';
import type { MangaQueryParams } from '../models/manga.model.js';

export class MangaRepository {
  private readonly repo = AppDataSource.getRepository(Manga);

  async findMany(params: MangaQueryParams): Promise<[Manga[], number]> {
    const page = Math.max(1, parseInt(params.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit || '24', 10)));
    const skip = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('manga')
      .leftJoinAndSelect('manga.editions', 'edition')
      .leftJoinAndSelect('edition.publisher', 'publisher')
      .leftJoinAndSelect('edition.volumes', 'volume')
      .leftJoinAndSelect('volume.prices', 'price');

    // 1. Busca textual ampla (Título brasileiro, original, autor, editora ou ISBN)
    if (params.search) {
      qb.andWhere(
        '(manga.title ILIKE :s OR manga.originalTitle ILIKE :s OR manga.author ILIKE :s OR publisher.name ILIKE :s OR volume.isbn ILIKE :s)',
        { s: `%${params.search}%` },
      );
    }

    // 2. Filtro por Editora
    if (params.publisher) {
      qb.andWhere('(publisher.slug = :pub OR publisher.name ILIKE :pub)', {
        pub: params.publisher,
      });
    }

    // 3. Filtro por Categoria / Demografia
    if (params.category) {
      qb.andWhere('manga.category = :cat', { cat: params.category });
    }

    // 4. Filtro por Status da Edição (ongoing, completed, cancelled)
    if (params.status) {
      qb.andWhere('edition.status = :status', { status: params.status });
    }

    // 5. Filtros por Ano
    if (params.yearFrom) {
      qb.andWhere('volume.releaseYear >= :yearFrom', {
        yearFrom: parseInt(params.yearFrom, 10),
      });
    }
    if (params.yearTo) {
      qb.andWhere('volume.releaseYear <= :yearTo', {
        yearTo: parseInt(params.yearTo, 10),
      });
    }

    // 6. Ordenação estável com critério secundário por ID
    switch (params.sort) {
      case 'title_desc':
        qb.orderBy('manga.title', 'DESC').addOrderBy('manga.id', 'ASC');
        break;
      case 'recent':
        qb.orderBy('manga.createdAt', 'DESC').addOrderBy('manga.id', 'ASC');
        break;
      case 'oldest':
        qb.orderBy('manga.createdAt', 'ASC').addOrderBy('manga.id', 'ASC');
        break;
      case 'title_asc':
      default:
        qb.orderBy('manga.title', 'ASC').addOrderBy('manga.id', 'ASC');
        break;
    }

    qb.skip(skip).take(limit);

    return qb.getManyAndCount();
  }

  async findByIdentifier(identifier: string): Promise<Manga | null> {
    return this.repo
      .createQueryBuilder('manga')
      .leftJoinAndSelect('manga.editions', 'edition')
      .leftJoinAndSelect('edition.publisher', 'publisher')
      .leftJoinAndSelect('edition.volumes', 'volume')
      .leftJoinAndSelect('volume.prices', 'price')
      .where('manga.slug = :id OR manga.id = :uuid', {
        id: identifier,
        uuid: identifier.length === 36 ? identifier : '00000000-0000-0000-0000-000000000000',
      })
      .getOne();
  }
}
