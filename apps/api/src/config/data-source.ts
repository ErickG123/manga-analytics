import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  Publisher,
  Manga,
  Edition,
  Volume,
  VolumeVariant,
  VolumePrice,
  PriceObservation,
  DataSource as DataSourceEntity,
  ExternalReference,
  ImportJob,
  CollectorCheckpoint,
  DataQualityIssue,
} from '../entities/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { AddCollectorIncrementalState1762264800000 } from '../migrations/1762264800000-AddCollectorIncrementalState.js';
import { AddVolumeVariants1762272000000 } from '../migrations/1762272000000-AddVolumeVariants.js';
import { AddCollectorCheckpoints1762280000000 } from '../migrations/1762280000000-AddCollectorCheckpoints.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://manga_atlas:manga_atlas_secret@localhost:5432/manga_atlas?schema=public';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: dbUrl,
  synchronize: true, // Garante que as tabelas sejam criadas e atualizadas no PostgreSQL 17
  logging: process.env.NODE_ENV === 'development',
  entities: [
    Publisher,
    Manga,
    Edition,
    Volume,
    VolumeVariant,
    VolumePrice,
    PriceObservation,
    DataSourceEntity,
    ExternalReference,
    ImportJob,
    CollectorCheckpoint,
    DataQualityIssue,
  ],
  migrations: [
    AddCollectorIncrementalState1762264800000,
    AddVolumeVariants1762272000000,
    AddCollectorCheckpoints1762280000000,
  ],
  migrationsRun: true,
  subscribers: [],
});
