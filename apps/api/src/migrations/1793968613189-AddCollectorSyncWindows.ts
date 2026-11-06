import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectorSyncWindows1793968613189 implements MigrationInterface {
  name = 'AddCollectorSyncWindows1793968613189';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE collector_checkpoints ADD COLUMN IF NOT EXISTS "syncCursorAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE collector_checkpoints ADD COLUMN IF NOT EXISTS "syncTargetAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE collector_checkpoints ADD COLUMN IF NOT EXISTS "syncOverlapSeconds" integer NOT NULL DEFAULT 300',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE collector_checkpoints DROP COLUMN IF EXISTS "syncOverlapSeconds"',
    );
    await queryRunner.query(
      'ALTER TABLE collector_checkpoints DROP COLUMN IF EXISTS "syncTargetAt"',
    );
    await queryRunner.query(
      'ALTER TABLE collector_checkpoints DROP COLUMN IF EXISTS "syncCursorAt"',
    );
  }
}
