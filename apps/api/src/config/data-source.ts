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
  CollectorSourceState,
  CollectorFailure,
  DataQualityIssue,
} from '../entities/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { AddCollectorIncrementalState1762264800000 } from '../migrations/1762264800000-AddCollectorIncrementalState.js';
import { AddVolumeVariants1762272000000 } from '../migrations/1762272000000-AddVolumeVariants.js';
import { AddCollectorCheckpoints1762280000000 } from '../migrations/1762280000000-AddCollectorCheckpoints.js';
import { AddCollectorRecovery1762290000000 } from '../migrations/1762290000000-AddCollectorRecovery.js';
import { AddCollectorRecoveryUniqueIndexes1762300000000 } from '../migrations/1762300000000-AddCollectorRecoveryUniqueIndexes.js';
import { SeparateAdminTriggerJobs1762310000000 } from '../migrations/1762310000000-SeparateAdminTriggerJobs.js';
import { AddCollectorSyncWindows1793968613189 } from '../migrations/1793968613189-AddCollectorSyncWindows.js';

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
    CollectorSourceState,
    CollectorFailure,
    DataQualityIssue,
  ],
  migrations: [
    AddCollectorIncrementalState1762264800000,
    AddVolumeVariants1762272000000,
    AddCollectorCheckpoints1762280000000,
    AddCollectorRecovery1762290000000,
    AddCollectorRecoveryUniqueIndexes1762300000000,
    SeparateAdminTriggerJobs1762310000000,
    AddCollectorSyncWindows1793968613189,
  ],
  migrationsRun: true,
  subscribers: [],
});
