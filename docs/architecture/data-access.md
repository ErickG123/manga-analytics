# Acesso e semântica dos dados — Mangá Atlas

## Caminho dos dados

O Collector Python consulta a fonte externa, normaliza a resposta e persiste com psycopg no PostgreSQL. A API Fastify consulta o mesmo banco via TypeORM e expõe contratos versionados. A SPA Angular chama a API por serviços tipados; não acessa o banco nem coleta páginas externas. Testes podem usar repositórios e clientes substitutos.

```text
fonte → parser/normalizer → PostgreSQL ← TypeORM/API ← serviços Angular ← componentes
```

## Granularidade do catálogo

`Manga` agrupa a obra; `Edition` representa uma publicação brasileira por editora e cabeçalho de origem; `Volume` pertence à edição; `VolumeVariant` representa uma variante de um volume. Valores da reedição não devem ser unidos aos da publicação anterior. Os detalhes de identidade e tipo editorial estão em [Publicações e formatos](../data/publication-formats.md).

## Temporalidades

| Dado                                                       | Significado                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Data de lançamento (`releaseDate`, ano/mês/dia e precisão) | Data brasileira indicada pela fonte para aquela edição e volume; pode estar incompleta ou prevista.         |
| Situação de lançamento (`releaseStatus`)                   | `released`, `planned` ou `unknown` no momento interpretado.                                                 |
| Preço e observação (`PriceObservation.observedAt`)         | Valor de capa lido na consulta. Registra quando o Collector observou, não o dia exato em que o preço mudou. |
| Modificação da ficha (`sourceModifiedAt`)                  | Timestamp da página na fonte, usado pela sincronização incremental.                                         |
| Atualização interna (`createdAt`, `updatedAt`)             | Timestamps de persistência no banco, não eventos de publicação/reajuste.                                    |

O gráfico de preços por ano agrupa o valor de capa informado pelo ano de lançamento do volume. Ele não representa o histórico de reajustes anuais. Os relatórios e tooltips devem explicitar essa base e o tamanho da amostra.

## Dados ausentes e inferência

Quando a fonte omite um valor, o upsert preserva dados existentes onde aplicável. O parser não deve transformar ausência de formato em `regular`; usa `unknown`, preserva a evidência e só preenche `volumesPerBook` quando a indicação dá suporte. Dimensões como `13,7 x 20 cm` são formato físico e ficam separadas de 2 em 1/Omnibus.

Contagens da obra e do volume medem unidades diferentes: uma obra pode ter vários volumes, publicações ou variantes; cada volume continua ligado à respectiva edição. Analytics precisam contar IDs distintos na granularidade do indicador para evitar inflação ao fazer joins.

## Modelos e contratos

Tipos do frontend residem em `models/*.model.ts`, separados por feature; DTOs da API ficam em models do módulo, enquanto o Collector usa dataclasses tipadas. O contrato do catálogo inclui metadados editoriais na edição e na referência de cada volume. Relatórios CSV expõem obra, publicação, editora, formato, volume, preço ou data conforme o tipo de relatório.
