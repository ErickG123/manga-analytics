import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEditionFormat1793973000000 implements MigrationInterface {
  name = 'AddDigitalEditionFormat1793973000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE editions DROP CONSTRAINT IF EXISTS "CHK_editions_format_type"',
    );
    await queryRunner.query(`
      ALTER TABLE editions ADD CONSTRAINT "CHK_editions_format_type"
      CHECK ("formatType" IN ('regular', 'two_in_one', 'three_in_one', 'omnibus', 'definitive', 'deluxe', 'box_set', 'digital_edition', 'other', 'unknown'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE editions SET "formatType" = 'other' WHERE "formatType" = 'digital_edition'`,
    );
    await queryRunner.query(
      'ALTER TABLE editions DROP CONSTRAINT IF EXISTS "CHK_editions_format_type"',
    );
    await queryRunner.query(`
      ALTER TABLE editions ADD CONSTRAINT "CHK_editions_format_type"
      CHECK ("formatType" IN ('regular', 'two_in_one', 'three_in_one', 'omnibus', 'definitive', 'deluxe', 'box_set', 'other', 'unknown'))
    `);
  }
}
