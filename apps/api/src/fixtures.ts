import 'reflect-metadata';
import { AppDataSource } from './config/data-source.js';
import {
  Publisher,
  Manga,
  Edition,
  Volume,
  VolumePrice,
  PriceObservation,
  DataSource,
  ImportJob,
} from './entities/index.js';

export async function runFixtures() {
  console.log('🧪 Populando ambiente de testes com Fixtures determinísticas...');
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const publisherRepo = AppDataSource.getRepository(Publisher);
  const mangaRepo = AppDataSource.getRepository(Manga);
  const editionRepo = AppDataSource.getRepository(Edition);
  const volumeRepo = AppDataSource.getRepository(Volume);
  const priceRepo = AppDataSource.getRepository(VolumePrice);
  const obsRepo = AppDataSource.getRepository(PriceObservation);
  const dsRepo = AppDataSource.getRepository(DataSource);
  const jobRepo = AppDataSource.getRepository(ImportJob);

  // 1. Data Source determinístico
  let testSource = await dsRepo.findOne({ where: { name: 'Fonte de Testes Determinísticos' } });
  if (!testSource) {
    testSource = await dsRepo.save({
      name: 'Fonte de Testes Determinísticos',
      url: 'https://fixtures.mangaatlas.local',
      sourceType: 'test-fixture',
    });
  }

  // 2. Editoras controladas
  const publishers = ['Panini', 'JBC', 'Pipoca & Nanquim', 'NewPOP'];
  const pubEntities: Record<string, Publisher> = {};

  for (const name of publishers) {
    let p = await publisherRepo.findOne({ where: { name } });
    if (!p) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      p = await publisherRepo.save({
        name,
        slug,
        website: `https://${slug}.com.br`,
      });
    }
    pubEntities[name] = p;
  }

  // 3. Gerar 30 obras para validação determinística de paginação (> 2 páginas de 12 itens)
  console.log('📦 Inserindo lote de 30 obras para paginação e filtros...');
  for (let i = 1; i <= 30; i++) {
    const pubName = publishers[(i - 1) % publishers.length];
    const category = i % 3 === 0 ? 'Seinen' : i % 2 === 0 ? 'Shonen' : 'Shojo';
    const slug = `obra-teste-${String(i).padStart(2, '0')}`;

    let m = await mangaRepo.findOne({ where: { slug } });
    if (!m) {
      m = await mangaRepo.save({
        title: `Obra Teste ${String(i).padStart(2, '0')}`,
        slug,
        originalTitle: `Test Work ${i}`,
        author: `Autor Teste ${((i - 1) % 5) + 1}`,
        description: `Descrição determinística da obra de teste ${i}.`,
        category,
        accent: i % 2 === 0 ? '#e50914' : '#f97316',
        initials: `T${i}`,
        coverUrl:
          i % 4 === 0 ? null : `https://images.unsplash.com/photo-${1534447677768 + i}?w=400`,
      });

      const ed = await editionRepo.save({
        mangaId: m.id,
        publisherId: pubEntities[pubName].id,
        name: 'Edição Padrão',
        format: 'Tankobon',
        status: i > 25 ? 'completed' : 'ongoing',
      });

      // Volume 1
      const vol1 = await volumeRepo.save({
        editionId: ed.id,
        number: 1,
        title: `Volume 1`,
        releaseDate: `15/01/202${i % 5}`,
        releaseDatePrecision: 'day',
        releaseYear: 2020 + (i % 5),
        releaseMonth: 1,
        releaseStatus: 'released',
        pages: 192 + (i % 3) * 10,
        isbn: `978-85-426-${String(i).padStart(4, '0')}-0`,
      });

      await priceRepo.save({
        volumeId: vol1.id,
        amount: (20.0 + i).toFixed(2),
        currency: 'BRL',
        sourceId: testSource.id,
        observedAt: new Date(),
      });

      // Múltiplas observações de preço para os primeiros 5 volumes
      if (i <= 5) {
        await obsRepo.save({
          volumeId: vol1.id,
          amount: (20.0 + i).toFixed(2),
          currency: 'BRL',
          priceType: 'cover',
          sourceId: testSource.id,
          observedAt: new Date(Date.now() - 3600000 * 24 * 30),
        });
        await obsRepo.save({
          volumeId: vol1.id,
          amount: (24.0 + i).toFixed(2),
          currency: 'BRL',
          priceType: 'cover',
          sourceId: testSource.id,
          observedAt: new Date(),
        });
      }

      // Volume 2 futuro (apenas para obras ímpares para testar lançamentos previstos)
      if (i % 2 !== 0) {
        const vol2 = await volumeRepo.save({
          editionId: ed.id,
          number: 2,
          title: `Volume 2`,
          releaseDate: `10/12/2026`,
          releaseDatePrecision: 'day',
          releaseYear: 2026,
          releaseMonth: 12,
          releaseStatus: 'planned',
          pages: 200,
          isbn: `978-85-426-${String(i + 50).padStart(4, '0')}-0`,
        });

        await priceRepo.save({
          volumeId: vol2.id,
          amount: (25.0 + i).toFixed(2),
          currency: 'BRL',
          sourceId: testSource.id,
          observedAt: new Date(),
        });
      }
    }
  }

  // 4. Jobs de Teste (1 completed, 1 failed)
  const existingTestJob = await jobRepo.findOne({ where: { sourceId: testSource.id } });
  if (!existingTestJob) {
    await jobRepo.save({
      sourceId: testSource.id,
      status: 'completed',
      recordsProcessed: 30,
      recordsCreated: 30,
      recordsUpdated: 0,
      recordsFailed: 0,
      startedAt: new Date(Date.now() - 3600000 * 12),
      completedAt: new Date(Date.now() - 3600000 * 12 + 45000),
      errors: [],
    });

    await jobRepo.save({
      sourceId: testSource.id,
      status: 'failed',
      recordsProcessed: 10,
      recordsCreated: 8,
      recordsUpdated: 0,
      recordsFailed: 2,
      startedAt: new Date(Date.now() - 3600000 * 6),
      completedAt: new Date(Date.now() - 3600000 * 6 + 15000),
      errors: ['Erro HTTP 503 na conexão com BBM', 'Falha ao analisar ficha externa'],
    });
  }

  console.log('✅ Fixtures determinísticas carregadas com sucesso no PostgreSQL!');
}

if (process.argv[1]?.includes('fixtures')) {
  runFixtures()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro ao rodar fixtures:', err);
      process.exit(1);
    });
}
