import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectorRecovery1762290000000 implements MigrationInterface {
  name = 'AddCollectorRecovery1762290000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE import_jobs
      ADD COLUMN IF NOT EXISTS "runType" character varying(30) NOT NULL DEFAULT 'import',
      ADD COLUMN IF NOT EXISTS "terminationReason" text,
      ADD COLUMN IF NOT EXISTS "resumeCount" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS metrics jsonb,
      ADD COLUMN IF NOT EXISTS "checkpointPage" integer,
      ADD COLUMN IF NOT EXISTS "checkpointOffset" integer`);
    await queryRunner.query(`UPDATE import_jobs SET status = 'interrupted', "finishedAt" = NOW(),
      "terminationReason" = 'Recovered stale execution during collector-recovery migration'
      WHERE status = 'running' AND "startedAt" < NOW() - INTERVAL '45 minutes'`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_import_jobs_running_source"
      ON import_jobs ("sourceId") WHERE status = 'running'`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS collector_source_states (
      "sourceId" character varying(100) PRIMARY KEY,
      status character varying(20) NOT NULL DEFAULT 'active',
      "suspendedUntil" TIMESTAMP WITH TIME ZONE,
      "suspensionReason" text,
      "lastHttpStatus" integer,
      "lastFailureAt" TIMESTAMP WITH TIME ZONE,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS collector_failures (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "sourceId" character varying(100) NOT NULL,
      "externalId" character varying(255) NOT NULL,
      "externalUrl" text,
      category character varying(30) NOT NULL,
      status character varying(30) NOT NULL DEFAULT 'needs_review',
      message text NOT NULL,
      "lastHttpStatus" integer,
      attempts integer NOT NULL DEFAULT 1,
      "jobId" uuid,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "resolvedAt" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "UQ_collector_failures_source_external_category"
        UNIQUE ("sourceId", "externalId", category)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_collector_failures_status"
      ON collector_failures ("sourceId", status, category)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_import_jobs_running_source"');
    await queryRunner.query('DROP TABLE IF EXISTS collector_failures');
    await queryRunner.query('DROP TABLE IF EXISTS collector_source_states');
    await queryRunner.query(`ALTER TABLE import_jobs
      DROP COLUMN IF EXISTS "runType", DROP COLUMN IF EXISTS "terminationReason",
      DROP COLUMN IF EXISTS "resumeCount", DROP COLUMN IF EXISTS metrics,
      DROP COLUMN IF EXISTS "checkpointPage", DROP COLUMN IF EXISTS "checkpointOffset"`);
  }
}
