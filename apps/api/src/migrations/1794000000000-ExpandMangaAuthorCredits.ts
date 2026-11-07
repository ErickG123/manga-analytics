import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandMangaAuthorCredits1794000000000 implements MigrationInterface {
  name = 'ExpandMangaAuthorCredits1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE mangas ALTER COLUMN author TYPE text');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const longValues = (await queryRunner.query(
      'SELECT 1 FROM mangas WHERE char_length(author) > 255 LIMIT 1',
    )) as unknown[];
    if (longValues.length) {
      throw new Error(
        'Não é seguro reduzir author para 255 caracteres: existem créditos que seriam truncados.',
      );
    }
    await queryRunner.query('ALTER TABLE mangas ALTER COLUMN author TYPE character varying(255)');
  }
}
