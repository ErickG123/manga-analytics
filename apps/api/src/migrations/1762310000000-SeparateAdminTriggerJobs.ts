import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparateAdminTriggerJobs1762310000000 implements MigrationInterface {
  name = 'SeparateAdminTriggerJobs1762310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_import_jobs_running_source"');
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_import_jobs_running_source"
      ON import_jobs ("sourceId")
      WHERE status = 'running' AND "runType" <> 'admin_trigger'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_import_jobs_running_source"');
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_import_jobs_running_source"
      ON import_jobs ("sourceId") WHERE status = 'running'`);
  }
}
