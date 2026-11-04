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
  DataQualityIssue,
} from './entities/index.js';

export async function runSeed() {
  console.log('🌱 Inicializando DataSource TypeORM para Seed...');
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
  const issueRepo = AppDataSource.getRepository(DataQualityIssue);

  // 1. Data Source
  let bbmSource = await dsRepo.findOne({ where: { name: 'Biblioteca Brasileira de Mangás' } });
  if (!bbmSource) {
    bbmSource = await dsRepo.save({
      name: 'Biblioteca Brasileira de Mangás',
      url: 'https://blogbbm.com',
      sourceType: 'wordpress-api',
    });
  }

  // 2. Editoras
  const publishersData = [
    { name: 'Panini', slug: 'panini', website: 'https://panini.com.br' },
    { name: 'JBC', slug: 'jbc', website: 'https://editorajbc.com.br' },
    { name: 'Pipoca & Nanquim', slug: 'pipoca-nanquim', website: 'https://pipocaenanquim.com.br' },
    { name: 'NewPOP', slug: 'newpop', website: 'https://newpop.com.br' },
  ];

  const publishersMap = new Map<string, Publisher>();
  for (const pub of publishersData) {
    let p = await publisherRepo.findOne({ where: { slug: pub.slug } });
    if (!p) {
      p = await publisherRepo.save(pub);
    }
    publishersMap.set(pub.name, p);
  }

  // 3. Obras piloto
  const pilotMangas = [
    {
      title: 'One Piece Aventura Escolar',
      originalTitle: 'ONE PIECE学園',
      slug: 'one-piece-aventura-escolar',
      synopsis: 'Uma divertida aventura alternativa dos Chapéus de Palha em ambiente escolar.',
      author: 'Souhei Kouji / Eiichiro Oda',
      category: 'Aventura',
      accent: '#d4a055',
      initials: 'OP',
      coverUrl: 'https://blogbbm.com/wp-content/uploads/2024/01/one-piece-escolar-01.jpg',
      publisher: 'Panini',
      volumes: [
        {
          number: 1,
          releaseDate: '15/04/2026',
          precision: 'day',
          status: 'released',
          price: '39.90',
          year: 2026,
          month: 4,
          day: 15,
        },
        {
          number: 2,
          releaseDate: '15/05/2026',
          precision: 'day',
          status: 'released',
          price: '39.90',
          year: 2026,
          month: 5,
          day: 15,
        },
        {
          number: 3,
          releaseDate: '15/06/2026',
          precision: 'day',
          status: 'released',
          price: '42.90',
          year: 2026,
          month: 6,
          day: 15,
        },
        {
          number: 4,
          releaseDate: '15/07/2026',
          precision: 'day',
          status: 'planned',
          price: '42.90',
          year: 2026,
          month: 7,
          day: 15,
        },
      ],
    },
    {
      title: 'Witch Watch',
      originalTitle: 'ウィッチウォッチ',
      slug: 'witch-watch',
      synopsis: 'Comédia, magia e confusões entre uma jovem bruxa e seu ogro protetor.',
      author: 'Kenta Shinohara',
      category: 'Fantasia',
      accent: '#a98cbd',
      initials: 'WW',
      coverUrl: 'https://blogbbm.com/wp-content/uploads/2023/10/witch-watch-01.jpg',
      publisher: 'Panini',
      volumes: [
        {
          number: 1,
          releaseDate: '15/02/2026',
          precision: 'day',
          status: 'released',
          price: '34.90',
          year: 2026,
          month: 2,
          day: 15,
        },
        {
          number: 2,
          releaseDate: '15/03/2026',
          precision: 'day',
          status: 'released',
          price: '34.90',
          year: 2026,
          month: 3,
          day: 15,
        },
        {
          number: 3,
          releaseDate: '15/04/2026',
          precision: 'day',
          status: 'released',
          price: '36.90',
          year: 2026,
          month: 4,
          day: 15,
        },
        {
          number: 4,
          releaseDate: '15/05/2026',
          precision: 'day',
          status: 'released',
          price: '36.90',
          year: 2026,
          month: 5,
          day: 15,
        },
        {
          number: 5,
          releaseDate: '15/06/2026',
          precision: 'day',
          status: 'planned',
          price: '39.90',
          year: 2026,
          month: 6,
          day: 15,
        },
      ],
    },
    {
      title: 'Chihayafuru',
      originalTitle: 'ちはやふる',
      slug: 'chihayafuru',
      synopsis: 'Uma apaixonante jornada de amizade, foco e competição através do jogo de Karuta.',
      author: 'Yuki Suetsugu',
      category: 'Drama',
      accent: '#7eaf9a',
      initials: 'CH',
      coverUrl: 'https://blogbbm.com/wp-content/uploads/2023/08/chihayafuru-01.jpg',
      publisher: 'JBC',
      volumes: [
        {
          number: 1,
          releaseDate: '10/05/2026',
          precision: 'day',
          status: 'released',
          price: '29.90',
          year: 2026,
          month: 5,
          day: 10,
        },
        {
          number: 2,
          releaseDate: '10/06/2026',
          precision: 'day',
          status: 'released',
          price: '32.90',
          year: 2026,
          month: 6,
          day: 10,
        },
        {
          number: 3,
          releaseDate: '10/07/2026',
          precision: 'day',
          status: 'planned',
          price: '32.90',
          year: 2026,
          month: 7,
          day: 10,
        },
      ],
    },
    {
      title: 'City Hunter',
      originalTitle: 'シティーハンTER',
      slug: 'city-hunter',
      synopsis:
        'Ryo Saeba é um varredor de Tóquio que resolve casos perigosos com precisão e humor.',
      author: 'Tsukasa Hojo',
      category: 'Ação',
      accent: '#789ac0',
      initials: 'CT',
      coverUrl: 'https://blogbbm.com/wp-content/uploads/2023/11/city-hunter-01.jpg',
      publisher: 'Pipoca & Nanquim',
      volumes: [
        {
          number: 1,
          releaseDate: '20/06/2026',
          precision: 'day',
          status: 'released',
          price: '49.90',
          year: 2026,
          month: 6,
          day: 20,
        },
        {
          number: 2,
          releaseDate: '20/07/2026',
          precision: 'day',
          status: 'released',
          price: '49.90',
          year: 2026,
          month: 7,
          day: 20,
        },
        {
          number: 3,
          releaseDate: '20/08/2026',
          precision: 'day',
          status: 'planned',
          price: '54.90',
          year: 2026,
          month: 8,
          day: 20,
        },
      ],
    },
    {
      title: 'Centuria',
      originalTitle: 'センチュリア',
      slug: 'centuria',
      synopsis: 'Fantasia sombria e destino sangrento em alto mar.',
      author: 'Tohru Kuramori',
      category: 'Fantasia',
      accent: '#c5877d',
      initials: 'CE',
      coverUrl: null,
      publisher: 'Panini',
      volumes: [
        {
          number: 1,
          releaseDate: '15/03/2026',
          precision: 'day',
          status: 'released',
          price: '36.90',
          year: 2026,
          month: 3,
          day: 15,
        },
        {
          number: 2,
          releaseDate: '15/04/2026',
          precision: 'day',
          status: 'released',
          price: '36.90',
          year: 2026,
          month: 4,
          day: 15,
        },
        {
          number: 3,
          releaseDate: '15/05/2026',
          precision: 'day',
          status: 'released',
          price: '39.90',
          year: 2026,
          month: 5,
          day: 15,
        },
        {
          number: 4,
          releaseDate: '15/06/2026',
          precision: 'day',
          status: 'planned',
          price: '39.90',
          year: 2026,
          month: 6,
          day: 15,
        },
      ],
    },
    {
      title: 'Baki',
      originalTitle: 'グラップラー刃牙',
      slug: 'baki',
      synopsis: 'Baki Hanma treina implacavelmente para superar seu lendário pai.',
      author: 'Keisuke Itagaki',
      category: 'Ação',
      accent: '#b59a6a',
      initials: 'BK',
      coverUrl: null,
      publisher: 'NewPOP',
      volumes: [
        {
          number: 1,
          releaseDate: '10/07/2026',
          precision: 'day',
          status: 'released',
          price: '42.90',
          year: 2026,
          month: 7,
          day: 10,
        },
        {
          number: 2,
          releaseDate: '10/08/2026',
          precision: 'day',
          status: 'released',
          price: '42.90',
          year: 2026,
          month: 8,
          day: 10,
        },
        {
          number: 3,
          releaseDate: '10/09/2026',
          precision: 'day',
          status: 'planned',
          price: '44.90',
          year: 2026,
          month: 9,
          day: 10,
        },
      ],
    },
  ];

  for (const mData of pilotMangas) {
    let manga = await mangaRepo.findOne({ where: { slug: mData.slug } });
    if (!manga) {
      manga = await mangaRepo.save({
        title: mData.title,
        originalTitle: mData.originalTitle,
        slug: mData.slug,
        synopsis: mData.synopsis,
        author: mData.author,
        category: mData.category,
        accent: mData.accent,
        initials: mData.initials,
        coverUrl: mData.coverUrl,
      });
    }

    const pub = publishersMap.get(mData.publisher)!;
    let edition = await editionRepo.findOne({ where: { mangaId: manga.id, publisherId: pub.id } });
    if (!edition) {
      edition = await editionRepo.save({
        mangaId: manga.id,
        publisherId: pub.id,
        name: 'Edição Padrão Brasileira',
        format: 'Tankobon',
        status: 'ongoing',
      });
    }

    for (const vData of mData.volumes) {
      let vol = await volumeRepo.findOne({
        where: { editionId: edition.id, number: vData.number },
      });
      if (!vol) {
        vol = await volumeRepo.save({
          editionId: edition.id,
          number: vData.number,
          title: `Volume ${vData.number}`,
          releaseDate: vData.releaseDate,
          releaseDatePrecision: vData.precision as 'day' | 'month' | 'year' | 'unknown',
          releaseStatus: vData.status as 'released' | 'planned' | 'unknown',
          releaseYear: vData.year,
          releaseMonth: vData.month,
          releaseDay: vData.day,
        });

        // Preço atual
        await priceRepo.save({
          volumeId: vol.id,
          amount: vData.price,
          currency: 'BRL',
          sourceId: bbmSource.id,
          observedAt: new Date(),
        });

        // Observação histórica
        await obsRepo.save({
          volumeId: vol.id,
          amount: vData.price,
          currency: 'BRL',
          priceType: 'cover',
          sourceId: bbmSource.id,
          observedAt: new Date(),
        });
      }
    }
  }

  // 4. Jobs de Importação Demonstrativos
  const existingJob = await jobRepo.findOne({ where: { sourceId: bbmSource.id } });
  if (!existingJob) {
    await jobRepo.save({
      sourceId: bbmSource.id,
      status: 'completed',
      recordsProcessed: 42,
      recordsCreated: 38,
      recordsUpdated: 4,
      recordsFailed: 0,
      startedAt: new Date(Date.now() - 3600000 * 24),
      completedAt: new Date(Date.now() - 3600000 * 24 + 120000),
      errors: [],
    });
  }

  // 5. Inconsistências de Qualidade de Dados Demonstrativas
  const existingIssue = await issueRepo.findOne({ where: { ruleCode: 'INCOMPLETE_DATE' } });
  if (!existingIssue) {
    await issueRepo.save({
      entityType: 'volume',
      entityId: 'berserk-deluxe-vol-2',
      ruleCode: 'INCOMPLETE_DATE',
      severity: 'info',
      status: 'open',
      message: 'Volume com precisão de data estimada (08/2026)',
      details: { rawDate: '08/2026', precision: 'month' },
      sourceId: 'bbm',
    });

    await issueRepo.save({
      entityType: 'volume',
      entityId: 'naruto-gold-vol-99',
      ruleCode: 'INVALID_ISBN',
      severity: 'warning',
      status: 'open',
      message: 'Dígito verificador do ISBN não confere',
      details: { rawIsbn: '978-85-426-0000-9' },
      sourceId: 'bbm',
    });
  }

  console.log('✅ Seed executado com sucesso no PostgreSQL com TypeORM!');
}

if (process.argv[1]?.includes('seed')) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro no seed:', err);
      process.exit(1);
    });
}
