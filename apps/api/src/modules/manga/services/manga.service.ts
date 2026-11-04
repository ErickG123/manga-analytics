import { MangaRepository } from '../repositories/manga.repository.js';
import type {
  MangaDetailDto,
  MangaListItemDto,
  MangaQueryParams,
  PaginatedResult,
} from '../models/manga.model.js';

export class MangaService {
  constructor(private readonly repo = new MangaRepository()) {}

  async list(params: MangaQueryParams): Promise<PaginatedResult<MangaListItemDto>> {
    const page = Math.max(1, parseInt(params.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit || '50', 10)));
    const [items, total] = await this.repo.findMany(params);

    const data: MangaListItemDto[] = items.map((m) => {
      const allVolumes = m.editions.flatMap((e) => e.volumes);
      const pubName = m.editions[0]?.publisher?.name || 'Não informada';
      return {
        id: m.id,
        slug: m.slug,
        title: m.title,
        originalTitle: m.originalTitle,
        author: m.author,
        publisher: pubName,
        category: m.category,
        description: m.synopsis || '',
        accent: m.accent,
        initials: m.initials,
        coverUrl: m.coverUrl,
        volumesCount: allVolumes.length,
        volumes: allVolumes.map((v) => ({
          id: v.id,
          number: v.number,
          title: v.title,
          release: {
            value: v.releaseDate,
            precision: v.releaseDatePrecision,
            status: v.releaseStatus,
          },
          coverPriceBrl: v.prices?.[0]?.amount ? parseFloat(v.prices[0].amount) : null,
          coverUrl: v.coverUrl || m.coverUrl,
        })),
      };
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getByIdentifier(identifier: string): Promise<MangaDetailDto | null> {
    const manga = await this.repo.findByIdentifier(identifier);
    if (!manga) return null;

    const allVolumes = manga.editions.flatMap((e) => e.volumes).sort((a, b) => a.number - b.number);
    const pubName = manga.editions[0]?.publisher?.name || 'Não informada';

    return {
      id: manga.id,
      slug: manga.slug,
      title: manga.title,
      originalTitle: manga.originalTitle,
      author: manga.author,
      publisher: pubName,
      category: manga.category,
      description: manga.synopsis || '',
      accent: manga.accent,
      initials: manga.initials,
      coverUrl: manga.coverUrl,
      volumesCount: allVolumes.length,
      editions: manga.editions.map((e) => ({
        id: e.id,
        name: e.name,
        format: e.format,
        status: e.status,
        publisher: e.publisher.name,
      })),
      volumes: allVolumes.map((v) => ({
        id: v.id,
        number: v.number,
        title: v.title,
        isbn13: v.isbn13,
        pageCount: v.pageCount,
        coverUrl: v.coverUrl || manga.coverUrl,
        release: {
          value: v.releaseDate,
          precision: v.releaseDatePrecision,
          status: v.releaseStatus,
        },
        coverPriceBrl: v.prices?.[0]?.amount ? parseFloat(v.prices[0].amount) : null,
      })),
    };
  }
}
