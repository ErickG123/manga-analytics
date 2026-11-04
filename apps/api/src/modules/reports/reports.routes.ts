import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppDataSource } from '../../config/data-source.js';
import { PriceObservation, Volume } from '../../entities/index.js';

export async function registerReportsRoutes(app: FastifyInstance) {
  const volumeRepo = AppDataSource.getRepository(Volume);
  const obsRepo = AppDataSource.getRepository(PriceObservation);

  const sanitizeCsvValue = (val: string): string => {
    let safe = val.replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(safe)) {
      safe = `'${safe}`;
    }
    return `"${safe}"`;
  };

  app.get('/api/v1/reports/releases', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { format?: string };
    const volumes = await volumeRepo.find({
      relations: {
        edition: {
          manga: true,
          publisher: true,
        },
        prices: true,
      },
      order: { releaseDate: 'ASC' },
    });

    const rows = volumes.map((v) => ({
      obra: v.edition.manga.title,
      editora: v.edition.publisher.name,
      volume: `#${v.number}`,
      data: v.releaseDate || 'Não informada',
      status: v.releaseStatus === 'released' ? 'Lançado' : 'Previsto',
      preco: v.prices?.[0]?.amount ? `R$ ${parseFloat(v.prices[0].amount).toFixed(2)}` : '—',
    }));

    if (query.format === 'csv') {
      const header = ['Obra', 'Editora', 'Volume', 'Data', 'Status', 'Preço']
        .map(sanitizeCsvValue)
        .join(';');
      const body = rows
        .map((r) =>
          [r.obra, r.editora, r.volume, r.data, r.status, r.preco].map(sanitizeCsvValue).join(';'),
        )
        .join('\r\n');

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="relatorio-lancamentos.csv"');
      return reply.send(`\uFEFF${header}\r\n${body}`);
    }

    return reply.send(rows);
  });

  app.get('/api/v1/reports/prices', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { format?: string };
    const prices = await obsRepo.find({
      relations: {
        volume: {
          edition: {
            manga: true,
            publisher: true,
          },
        },
      },
      order: { observedAt: 'DESC' },
    });

    const rows = prices.map((p) => ({
      obra: p.volume.edition.manga.title,
      editora: p.volume.edition.publisher.name,
      edicao: p.volume.edition.name,
      volume: `#${p.volume.number}`,
      preco: `R$ ${parseFloat(p.amount).toFixed(2)}`,
      dataObservacao: p.observedAt.toISOString().split('T')[0],
      fonte: p.sourceId,
    }));

    if (query.format === 'csv') {
      const header = ['Obra', 'Editora', 'Edição', 'Volume', 'Preço', 'Data Observação', 'Fonte']
        .map(sanitizeCsvValue)
        .join(';');
      const body = rows
        .map((r) =>
          [r.obra, r.editora, r.edicao, r.volume, r.preco, r.dataObservacao, r.fonte]
            .map(sanitizeCsvValue)
            .join(';'),
        )
        .join('\r\n');

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="relatorio-precos.csv"');
      return reply.send(`\uFEFF${header}\r\n${body}`);
    }

    return reply.send(rows);
  });
}
