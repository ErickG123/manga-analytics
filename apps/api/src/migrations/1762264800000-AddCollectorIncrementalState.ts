import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectorIncrementalState1762264800000 implements MigrationInterface {
  name = 'AddCollectorIncrementalState1762264800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE external_references ADD COLUMN IF NOT EXISTS "sourceModifiedAt" character varying(50)',
    );
    await queryRunner.query(
      'ALTER TABLE external_references ADD COLUMN IF NOT EXISTS "sourceContentHash" character varying(64)',
    );
    await queryRunner.query(
      'ALTER TABLE external_references ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      `ALTER TABLE external_references ADD COLUMN IF NOT EXISTS "syncStatus" character varying(20) NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_editions_manga_publisher_unique" ON editions ("mangaId", "publisherId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_volumes_edition_number_unique" ON volumes ("editionId", number)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_volumes_edition_number_unique"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_editions_manga_publisher_unique"');
    await queryRunner.query('ALTER TABLE external_references DROP COLUMN IF EXISTS "syncStatus"');
    await queryRunner.query('ALTER TABLE external_references DROP COLUMN IF EXISTS "lastSyncedAt"');
    await queryRunner.query(
      'ALTER TABLE external_references DROP COLUMN IF EXISTS "sourceContentHash"',
    );
    await queryRunner.query(
      'ALTER TABLE external_references DROP COLUMN IF EXISTS "sourceModifiedAt"',
    );
  }
}
