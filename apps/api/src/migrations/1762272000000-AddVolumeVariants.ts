import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVolumeVariants1762272000000 implements MigrationInterface {
  name = 'AddVolumeVariants1762272000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS volume_variants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "volumeId" uuid NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
        name character varying(255) NOT NULL,
        "variantKey" character varying(255) NOT NULL,
        "releaseDate" character varying(30),
        "releaseDatePrecision" character varying(20) NOT NULL DEFAULT 'unknown',
        "releaseStatus" character varying(30) NOT NULL DEFAULT 'unknown',
        "releaseYear" integer,
        "releaseMonth" integer,
        "releaseDay" integer,
        isbn13 character varying(20),
        "pageCount" integer,
        "coverUrl" character varying(1000),
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_volume_variants_volume_key" UNIQUE ("volumeId", "variantKey")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_volume_variants_volumeId" ON volume_variants ("volumeId")',
    );
    await queryRunner.query(
      'ALTER TABLE volume_prices ADD COLUMN IF NOT EXISTS "variantId" uuid REFERENCES volume_variants(id) ON DELETE CASCADE',
    );
    await queryRunner.query(
      'ALTER TABLE price_observations ADD COLUMN IF NOT EXISTS "variantId" uuid REFERENCES volume_variants(id) ON DELETE CASCADE',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_volume_prices_variantId" ON volume_prices ("variantId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_price_observations_variantId" ON price_observations ("variantId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_price_observations_variantId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_volume_prices_variantId"');
    await queryRunner.query('ALTER TABLE price_observations DROP COLUMN IF EXISTS "variantId"');
    await queryRunner.query('ALTER TABLE volume_prices DROP COLUMN IF EXISTS "variantId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_volume_variants_volumeId"');
    await queryRunner.query('DROP TABLE IF EXISTS volume_variants');
  }
}
