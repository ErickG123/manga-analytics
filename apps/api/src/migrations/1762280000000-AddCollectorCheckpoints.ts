import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectorCheckpoints1762280000000 implements MigrationInterface {
  name = 'AddCollectorCheckpoints1762280000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS collector_checkpoints (
      "sourceId" character varying(100) NOT NULL,
      scope character varying(50) NOT NULL,
      mode character varying(30) NOT NULL DEFAULT 'backfill',
      status character varying(20) NOT NULL DEFAULT 'pending',
      "currentPage" integer NOT NULL DEFAULT 1,
      "currentOffset" integer NOT NULL DEFAULT 0,
      "lastExternalId" character varying(255),
      "processedCount" integer NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "completedAt" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "PK_collector_checkpoints" PRIMARY KEY ("sourceId", scope)
    )`);
    await queryRunner.query(
      'ALTER TABLE collector_checkpoints ADD COLUMN IF NOT EXISTS "currentOffset" integer NOT NULL DEFAULT 0',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS collector_checkpoints');
  }
}
