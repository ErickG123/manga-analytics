import { AppDataSource } from '../../../config/data-source.js';
import { ExternalReference, Manga } from '../../../entities/index.js';
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
      .leftJoinAndSelect('volume.prices', 'price')
      .leftJoinAndSelect('volume.variants', 'variant')
      .leftJoinAndSelect('variant.prices', 'variantPrice');

    // 1. Busca textual ampla (Título brasileiro, original, autor, editora ou ISBN)
    if (params.search) {
      qb.andWhere(
        `(
          manga.title ILIKE :s OR manga.originalTitle ILIKE :s OR manga.author ILIKE :s
          OR EXISTS (SELECT 1 FROM editions search_edition
            INNER JOIN publishers search_publisher ON search_publisher.id = search_edition."publisherId"
            WHERE search_edition."mangaId" = manga.id AND search_publisher.name ILIKE :s)
          OR EXISTS (SELECT 1 FROM volumes search_volume
            WHERE search_volume."editionId" IN (SELECT e.id FROM editions e WHERE e."mangaId" = manga.id)
            AND search_volume.isbn13 ILIKE :s)
        )`,
        { s: `%${params.search}%` },
      );
    }
    if (params.ids) {
      const ids = params.ids
        .split(',')
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
        .slice(0, 100);
      if (ids.length === 0) return [[], 0];
      qb.andWhere('manga.id IN (:...ids)', { ids });
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
      qb.andWhere(
        'EXISTS (SELECT 1 FROM editions filter_edition WHERE filter_edition."mangaId" = manga.id AND filter_edition.status = :status)',
        { status: params.status },
      );
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

    const volumeCountQuery =
      '(SELECT COUNT(*) FROM volumes count_volume INNER JOIN editions count_edition ON count_edition.id = count_volume."editionId" WHERE count_edition."mangaId" = manga.id)';
    if (params.volumesMin) {
      qb.andWhere(`${volumeCountQuery} >= :volumesMin`, {
        volumesMin: parseInt(params.volumesMin, 10),
      });
    }
    if (params.volumesMax) {
      qb.andWhere(`${volumeCountQuery} <= :volumesMax`, {
        volumesMax: parseInt(params.volumesMax, 10),
      });
    }
    if (params.hasPrice === 'true') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM volumes priced_volume INNER JOIN volume_prices price_record ON price_record."volumeId" = priced_volume.id INNER JOIN editions priced_edition ON priced_edition.id = priced_volume."editionId" WHERE priced_edition."mangaId" = manga.id)',
      );
    } else if (params.hasPrice === 'false') {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM volumes priced_volume INNER JOIN volume_prices price_record ON price_record."volumeId" = priced_volume.id INNER JOIN editions priced_edition ON priced_edition.id = priced_volume."editionId" WHERE priced_edition."mangaId" = manga.id)',
      );
    }
    if (params.upcoming === 'true') {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM volumes future_volume INNER JOIN editions future_edition ON future_edition.id = future_volume."editionId"
          WHERE future_edition."mangaId" = manga.id AND future_volume."releaseStatus" = 'planned'
          AND future_volume."releaseYear" IS NOT NULL AND (future_volume."releaseYear", COALESCE(future_volume."releaseMonth", 12), COALESCE(future_volume."releaseDay", 31)) >= (EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(DAY FROM CURRENT_DATE)::int))`,
      );
    }
    if (params.hasCover === 'true') {
      qb.andWhere(
        `(manga."coverUrl" IS NOT NULL OR EXISTS (SELECT 1 FROM volumes cover_volume INNER JOIN editions cover_edition ON cover_edition.id = cover_volume."editionId" WHERE cover_edition."mangaId" = manga.id AND cover_volume."coverUrl" IS NOT NULL))`,
      );
    } else if (params.hasCover === 'false') {
      qb.andWhere(
        `(manga."coverUrl" IS NULL AND NOT EXISTS (SELECT 1 FROM volumes cover_volume INNER JOIN editions cover_edition ON cover_edition.id = cover_volume."editionId" WHERE cover_edition."mangaId" = manga.id AND cover_volume."coverUrl" IS NOT NULL))`,
      );
    }

    // 6. Ordenação estável com critério secundário por ID
    switch (params.sort) {
      case 'title_desc':
        qb.orderBy('manga.title', 'DESC').addOrderBy('manga.id', 'ASC');
        break;
      case 'recent':
        qb.orderBy('manga.updatedAt', 'DESC').addOrderBy('manga.id', 'ASC');
        break;
      case 'oldest':
        qb.orderBy('manga.createdAt', 'ASC').addOrderBy('manga.id', 'ASC');
        break;
      case 'title_asc':
      default:
        qb.orderBy('manga.title', 'ASC').addOrderBy('manga.id', 'ASC');
        break;
      case 'volumes_desc':
        qb.orderBy(volumeCountQuery, 'DESC')
          .addOrderBy('manga.title', 'ASC')
          .addOrderBy('manga.id', 'ASC');
        break;
      case 'volumes_asc':
        qb.orderBy(volumeCountQuery, 'ASC')
          .addOrderBy('manga.title', 'ASC')
          .addOrderBy('manga.id', 'ASC');
        break;
      case 'release_desc':
        qb.orderBy(
          '(SELECT MAX(release_volume."releaseYear" * 10000 + COALESCE(release_volume."releaseMonth", 0) * 100 + COALESCE(release_volume."releaseDay", 0)) FROM volumes release_volume INNER JOIN editions release_edition ON release_edition.id = release_volume."editionId" WHERE release_edition."mangaId" = manga.id)',
          'DESC',
          'NULLS LAST',
        )
          .addOrderBy('manga.title', 'ASC')
          .addOrderBy('manga.id', 'ASC');
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
      .leftJoinAndSelect('volume.variants', 'variant')
      .leftJoinAndSelect('variant.prices', 'variantPrice')
      .where('manga.slug = :id OR manga.id = :uuid', {
        id: identifier,
        uuid: identifier.length === 36 ? identifier : '00000000-0000-0000-0000-000000000000',
      })
      .getOne();
  }

  async findSourceReference(
    mangaId: string,
  ): Promise<{ externalUrl: string | null; createdAt: Date } | null> {
    const result = await AppDataSource.getRepository(ExternalReference)
      .createQueryBuilder('reference')
      .select('reference.externalUrl', 'externalUrl')
      .addSelect('reference.createdAt', 'createdAt')
      .where('reference.entityId = :mangaId', { mangaId })
      .andWhere('reference.entityType = :entityType', { entityType: 'manga' })
      .orderBy('reference.createdAt', 'DESC')
      .getRawOne<{ externalUrl: string | null; createdAt: Date }>();
    return result ?? null;
  }
}
