import { AppDataSource } from '../../../config/data-source.js';
import { Publisher } from '../../../entities/index.js';

export class PublisherRepository {
  private readonly repo = AppDataSource.getRepository(Publisher);

  async findAll(): Promise<Publisher[]> {
    return this.repo
      .createQueryBuilder('publisher')
      .innerJoin('publisher.editions', 'edition')
      .where("LOWER(publisher.name) NOT IN ('não informada', 'nao informada')")
      .distinct(true)
      .orderBy('publisher.name', 'ASC')
      .getMany();
  }
}
