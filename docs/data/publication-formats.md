# Publicações e formatos editoriais

## Por que a edição é uma entidade separada

Uma ficha BBM representa a obra, mas pode listar mais de uma publicação brasileira, cada uma com seu próprio cabeçalho e tabela. Guardar apenas uma edição por combinação de obra e editora mistura volumes e preços, ou descarta uma republicação. A entidade `Edition` agora identifica a publicação pela chave estável extraída do cabeçalho e liga os volumes e variantes à publicação correta.

Exemplo: uma obra publicada em edição regular e depois em 2 em 1 possui duas edições da mesma obra e editora. Cada uma pode ter volume 1, preços, detalhes físicos e datas próprios.

## Campos persistidos

| Campo              | Significado                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `sourceEditionKey` | Chave derivada do nome/cabeçalho da publicação na fonte; participa da identidade da edição.                                 |
| `name`             | Nome do cabeçalho da publicação no BBM, por exemplo “2ª Publicação”.                                                        |
| `formatType`       | Categoria canônica usada para filtros e agregações.                                                                         |
| `format`           | Rótulo legível normalizado quando foi possível reconhecer o formato; “Não informado” quando não.                            |
| `formatDetails`    | Texto de formato físico publicado (por exemplo, dimensões), preservado como detalhe e não confundido com formato editorial. |
| `volumesPerBook`   | Quantidade inferida de volumes originais compilados num livro, preenchida apenas quando o tipo/menção dá suporte.           |
| `formatEvidence`   | Cabeçalho, expressão encontrada ou detalhe de origem que sustenta a classificação.                                          |

Os volumes carregam `editionId`, nome e tipo da edição nos DTOs do catálogo. APIs de analytics aceitam `formatType`; a análise exibe totais, cobertura identificada e publicações não classificadas. Relatórios CSV de lançamentos e preços incluem o nome e metadados da publicação.

## Taxonomia

| `formatType`   | Interpretação                                                                             |
| -------------- | ----------------------------------------------------------------------------------------- |
| `regular`      | Edição regular/padrão explicitamente indicada.                                            |
| `two_in_one`   | Um livro compila dois volumes originais.                                                  |
| `three_in_one` | Um livro compila três volumes originais.                                                  |
| `omnibus`      | Omnibus explicitamente indicado, sem inferir a quantidade compilada quando não declarada. |
| `definitive`   | Edição definitiva explicitamente indicada.                                                |
| `deluxe`       | Edição Deluxe explicitamente indicada.                                                    |
| `other`        | Outro formato editorial reconhecido, sem categoria mais específica.                       |
| `unknown`      | Evidência insuficiente para classificar. Não significa formato regular.                   |

## Como a fonte é interpretada

O parser percorre todas as tabelas de volumes da ficha e associa cada uma ao cabeçalho de publicação mais próximo. Para cada tabela, extrai suas próprias linhas, links e texto de contexto. Expressões no título, metadados da publicação e links dos produtos são sinais para 2 em 1/3 em 1; “omnibus”, “definitiva”, “deluxe” e indicações explícitas de regular também são reconhecidas. O texto de formato físico é salvo em campo separado. Cada classificação fica acompanhada por `formatEvidence` para permitir auditoria.

A heurística não afirma que toda página BBM descreve o formato de maneira completa. Quando não há evidência clara, o registro continua `unknown`; não se inventa o número de volumes compilados. Cabeçalhos repetidos podem precisar de curadoria se a fonte não nomear publicações de modo estável. Os testes usam fixtures e verificam o isolamento das tabelas, valores e metadados.

Na interface, registros `unknown` são exibidos com o rótulo **Volume convencional** como padrão legível. Esse é apenas um fallback de apresentação: o valor persistido continua `unknown`, sem afirmar que a fonte confirmou um formato regular.

## Verificação e operações

Após atualizar a migração, valide a cobertura por tipo com:

```sql
SELECT "formatType", COUNT(*) AS publicacoes
FROM editions
GROUP BY "formatType"
ORDER BY "formatType";
```

Uma ficha alterada deve ser reprocessada com `py -m collector.src.cli backfill --batch-size 5 --resume --force-reparse`. Para varredura continuada, use `./backfill-loop.ps1 -ForceReparse`; ela respeita o intervalo de requisições e a pausa configurada entre lotes. Uma reimportação completa pode demorar muitas horas. Não execute duas instâncias em paralelo. Veja [runbook do backfill](../collector/progressive-import-runbook.md).
