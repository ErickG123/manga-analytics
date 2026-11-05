import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectorRecoveryUniqueIndexes1762300000000 implements MigrationInterface {
  name = 'AddCollectorRecoveryUniqueIndexes1762300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_collector_failures_source_external_category"
      ON collector_failures ("sourceId", "externalId", category)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_import_jobs_running_source"
      ON import_jobs ("sourceId") WHERE status = 'running'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_collector_failures_source_external_category"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_import_jobs_running_source"');
  }
}
