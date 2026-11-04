import { PublisherRepository } from '../repositories/publisher.repository.js';
import type { PublisherDto } from '../models/publisher.model.js';

export class PublisherService {
  constructor(private readonly repo = new PublisherRepository()) {}

  async listAll(): Promise<PublisherDto[]> {
    const list = await this.repo.findAll();
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      website: p.website,
    }));
  }
}
