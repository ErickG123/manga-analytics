import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppDataSource } from '../../config/data-source.js';
import { Volume, PriceObservation } from '../../entities/index.js';

export async function registerVolumeRoutes(app: FastifyInstance) {
  const volumeRepo = AppDataSource.getRepository(Volume);
  const obsRepo = AppDataSource.getRepository(PriceObservation);

  app.get('/api/v1/volumes/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const volume = await volumeRepo.findOne({
      where: { id },
      relations: {
        edition: {
          manga: true,
          publisher: true,
        },
        prices: true,
        observations: true,
      },
    });

    if (!volume) {
      return reply.notFound('Volume não encontrado');
    }

    return reply.send(volume);
  });

  // Histórico temporal detalhado de observações de preço para um volume
  app.get<{ Params: { id: string } }>('/api/v1/volumes/:id/price-history', async (req, reply) => {
    const volume = await volumeRepo.findOne({
      where: { id: req.params.id },
      relations: { edition: { manga: true } },
    });

    if (!volume) {
      return reply.notFound('Volume não encontrado');
    }

    const observations = await obsRepo.find({
      where: { volumeId: req.params.id },
      order: { observedAt: 'ASC' },
    });

    return reply.send({
      volumeId: volume.id,
      number: volume.number,
      title: volume.title,
      observationsCount: observations.length,
      hasSufficientHistory: observations.length > 1,
      message:
        observations.length <= 1
          ? 'Ainda não há histórico suficiente de reajustes registrados para este volume.'
          : 'Histórico temporal completo.',
      observations: observations.map((o) => ({
        id: o.id,
        price: parseFloat(o.amount),
        observedAt: o.observedAt,
        sourceId: o.sourceId,
      })),
    });
  });
}
