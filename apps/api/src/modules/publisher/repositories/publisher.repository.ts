import { AppDataSource } from '../../../config/data-source.js';
import { Publisher } from '../../../entities/index.js';

export class PublisherRepository {
  private readonly repo = AppDataSource.getRepository(Publisher);

  async findAll(): Promise<Publisher[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }
}
