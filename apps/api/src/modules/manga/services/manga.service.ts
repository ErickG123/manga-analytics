import { MangaRepository } from '../repositories/manga.repository.js';
import type {
  MangaDetailDto,
  MangaListItemDto,
  MangaQueryParams,
  PaginatedResult,
} from '../models/manga.model.js';
import type { Volume } from '../../../entities/volume.entity.js';
import type { VolumeVariant } from '../../../entities/volume-variant.entity.js';
import type { VolumePrice } from '../../../entities/volume-price.entity.js';

function latestPrice(prices: VolumePrice[]): number | null {
  const latest = [...prices].sort(
    (left, right) =>
      (right.observedAt?.getTime() ?? right.createdAt.getTime()) -
      (left.observedAt?.getTime() ?? left.createdAt.getTime()),
  )[0];
  return latest ? Number(latest.amount) : null;
}

function latestCoverPrice(volume: Volume): number | null {
  return latestPrice((volume.prices ?? []).filter((price) => !price.variantId));
}

function latestVariantPrice(variant: VolumeVariant): number | null {
  return latestPrice(variant.prices ?? []);
}

function mapVariants(volume: Volume) {
  return (volume.variants ?? []).map((variant) => {
    const coverPriceBrl = latestVariantPrice(variant);
    return {
      id: variant.id,
      name: variant.name,
      release: {
        value: variant.releaseDate,
        precision: variant.releaseDatePrecision,
        status: variant.releaseStatus,
      },
      coverUrl: variant.coverUrl,
      coverPriceBrl,
      priceStatus: coverPriceBrl === null ? ('not_informed' as const) : ('priced' as const),
    };
  });
}

export class MangaService {
  constructor(private readonly repo = new MangaRepository()) {}

  async list(params: MangaQueryParams): Promise<PaginatedResult<MangaListItemDto>> {
    const parsedPage = Number.parseInt(params.page || '1', 10);
    const parsedLimit = Number.parseInt(params.limit || '24', 10);
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 24;
    const [items, total] = await this.repo.findMany(params);

    const data: MangaListItemDto[] = items.map((m) => {
      const editionVolumes = m.editions.flatMap((edition) =>
        edition.volumes.map((volume) => ({ volume, edition })),
      );
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
        volumesCount: editionVolumes.length,
        updatedAt: m.updatedAt,
        volumes: editionVolumes.map(({ volume: v, edition: e }) => {
          const coverPriceBrl = latestCoverPrice(v);
          return {
            id: v.id,
            editionId: e.id,
            editionName: e.name,
            editionFormat: e.format,
            editionFormatType: e.formatType,
            number: v.number,
            title: v.title,
            isbn13: v.isbn13,
            coverUrl: v.coverUrl || m.coverUrl,
            release: {
              value: v.releaseDate,
              precision: v.releaseDatePrecision,
              status: v.releaseStatus,
            },
            coverPriceBrl,
            priceStatus: coverPriceBrl === null ? ('not_informed' as const) : ('priced' as const),
            variants: mapVariants(v),
          };
        }),
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
    const source = await this.repo.findSourceReference(manga.id);

    const editionVolumes = manga.editions
      .flatMap((edition) => edition.volumes.map((volume) => ({ volume, edition })))
      .sort(
        (left, right) =>
          left.volume.number - right.volume.number ||
          left.edition.name.localeCompare(right.edition.name, 'pt-BR'),
      );
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
      volumesCount: editionVolumes.length,
      updatedAt: manga.updatedAt,
      sourceUrl: source?.externalUrl ?? null,
      sourceUpdatedAt: source?.createdAt ?? null,
      editions: manga.editions.map((e) => ({
        id: e.id,
        name: e.name,
        format: e.format,
        formatType: e.formatType,
        formatDetails: e.formatDetails ?? null,
        volumesPerBook: e.volumesPerBook ?? null,
        formatEvidence: e.formatEvidence ?? null,
        status: e.status,
        publisher: e.publisher.name,
      })),
      volumes: editionVolumes.map(({ volume: v, edition: e }) => {
        const coverPriceBrl = latestCoverPrice(v);
        return {
          id: v.id,
          editionId: e.id,
          editionName: e.name,
          editionFormat: e.format,
          editionFormatType: e.formatType,
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
          coverPriceBrl,
          priceStatus: coverPriceBrl === null ? ('not_informed' as const) : ('priced' as const),
          variants: mapVariants(v),
        };
      }),
    };
  }
}
