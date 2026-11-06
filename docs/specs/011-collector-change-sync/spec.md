# SPEC-011: Sincronização incremental por janela de alterações

## Objetivo

Depois do backfill inicial, descobrir e importar apenas fichas modificadas desde o último intervalo concluído, retomando com segurança janelas grandes e sem perder alterações durante a execução.

## Requisitos

- A descoberta usa `modified_after` e `modified_before` da API WordPress, em uma janela com limite superior fixo.
- O cursor de sincronização só avança ao concluir todas as páginas da janela; um checkpoint separado preserva página, offset e janela durante execuções parciais/interrupções.
- A primeira janela parte do início da última varredura completa quando disponível; uma sobreposição temporal dinâmica (pelo menos cinco minutos e, após cada janela, igual ao intervalo varrido) recupera registros afetados por alterações concorrentes durante a paginação.
- Metadados da listagem são percorridos por ID crescente dentro da janela; detalhes só são baixados quando `modified` diverge do estado persistido ou a ficha está pendente.
- Erros de origem, banco, descoberta ou transporte não avançam o cursor; falhas individuais duravelmente registradas podem avançar e ser reprocessadas pela fila existente.
- `sync` informa estado/progresso e pode ser executado novamente para continuar a janela ativa. O limite de itens por execução continua respeitando a configuração operacional.
- Testes cobrem parâmetros HTTP, cursor, sobreposição, paginação/resume, janela vazia, falhas e idempotência sem coleta remota.

## Fora de escopo

Agendamento automático, atualização instantânea, aumento de concorrência, varredura integral do conteúdo em cada execução ou alteração da cadência/rate limit da fonte.
