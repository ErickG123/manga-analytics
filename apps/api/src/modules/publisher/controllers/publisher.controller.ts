import type { FastifyReply, FastifyRequest } from 'fastify';
import { PublisherService } from '../services/publisher.service.js';

export class PublisherController {
  constructor(private readonly service = new PublisherService()) {}

  async list(_req: FastifyRequest, reply: FastifyReply) {
    const publishers = await this.service.listAll();
    return reply.send(publishers);
  }
}
