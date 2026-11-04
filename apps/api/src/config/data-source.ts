import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  Publisher,
  Manga,
  Edition,
  Volume,
  VolumePrice,
  PriceObservation,
  DataSource as DataSourceEntity,
  ExternalReference,
  ImportJob,
  DataQualityIssue,
} from '../entities/index.js';
import dotenv from 'dotenv';
import path from 'path';

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
    VolumePrice,
    PriceObservation,
    DataSourceEntity,
    ExternalReference,
    ImportJob,
    DataQualityIssue,
  ],
  migrations: [],
  subscribers: [],
});
