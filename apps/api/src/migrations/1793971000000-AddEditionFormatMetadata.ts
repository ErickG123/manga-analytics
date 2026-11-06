import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEditionFormatMetadata1793971000000 implements MigrationInterface {
  name = 'AddEditionFormatMetadata1793971000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE editions ADD COLUMN IF NOT EXISTS "sourceEditionKey" character varying(120) NOT NULL DEFAULT 'default'`,
    );
    await queryRunner.query(
      `ALTER TABLE editions ADD COLUMN IF NOT EXISTS "formatType" character varying(30) NOT NULL DEFAULT 'unknown'`,
    );
    await queryRunner.query('ALTER TABLE editions ADD COLUMN IF NOT EXISTS "formatDetails" text');
    await queryRunner.query('ALTER TABLE editions ALTER COLUMN "formatDetails" TYPE text');
    await queryRunner.query(
      'ALTER TABLE editions ADD COLUMN IF NOT EXISTS "volumesPerBook" smallint',
    );
    await queryRunner.query('ALTER TABLE editions ADD COLUMN IF NOT EXISTS "formatEvidence" text');
    await queryRunner.query(
      `UPDATE editions SET format = 'Não informado' WHERE format = 'Tankobon'`,
    );
    await queryRunner.query(`ALTER TABLE editions ALTER COLUMN format SET DEFAULT 'Não informado'`);
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_editions_manga_publisher_unique"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_editions_manga_publisher_source_key_unique"',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_editions_manga_publisher_source_key_unique" ON editions ("mangaId", "publisherId", "sourceEditionKey")',
    );
    await queryRunner.query(
      `ALTER TABLE editions ADD CONSTRAINT "CHK_editions_format_type" CHECK ("formatType" IN ('regular', 'two_in_one', 'three_in_one', 'omnibus', 'definitive', 'deluxe', 'other', 'unknown'))`,
    );
    await queryRunner.query(
      'ALTER TABLE editions ADD CONSTRAINT "CHK_editions_volumes_per_book" CHECK ("volumesPerBook" IS NULL OR "volumesPerBook" BETWEEN 1 AND 99)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(
      `SELECT 1 FROM editions GROUP BY "mangaId", "publisherId" HAVING COUNT(*) > 1 LIMIT 1`,
    )) as unknown[];
    if (duplicates.length) {
      throw new Error(
        'Não é seguro remover múltiplas publicações após a importação. Restaure o backup anterior antes do rollback.',
      );
    }
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_editions_manga_publisher_source_key_unique"',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_editions_manga_publisher_unique" ON editions ("mangaId", "publisherId")',
    );
    await queryRunner.query(
      'ALTER TABLE editions DROP CONSTRAINT IF EXISTS "CHK_editions_volumes_per_book"',
    );
    await queryRunner.query(
      'ALTER TABLE editions DROP CONSTRAINT IF EXISTS "CHK_editions_format_type"',
    );
    await queryRunner.query('ALTER TABLE editions DROP COLUMN IF EXISTS "formatEvidence"');
    await queryRunner.query('ALTER TABLE editions DROP COLUMN IF EXISTS "volumesPerBook"');
    await queryRunner.query('ALTER TABLE editions DROP COLUMN IF EXISTS "formatDetails"');
    await queryRunner.query('ALTER TABLE editions DROP COLUMN IF EXISTS "formatType"');
    await queryRunner.query('ALTER TABLE editions DROP COLUMN IF EXISTS "sourceEditionKey"');
    await queryRunner.query(`ALTER TABLE editions ALTER COLUMN format SET DEFAULT 'Tankobon'`);
  }
}
