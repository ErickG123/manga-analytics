# Plano — Console administrativo do Collector

1. Atualizar a coleta em lote para obter até 100 conteúdos completos por página, sem perder itens em lotes menores e com fallback por ficha.
2. Criar serviço de execução controlada no processo Fastify: iniciar/retomar, reparse desde o início, pausar após o lote, captura de saída e proteção contra concorrência.
3. Expor estado autenticado, lista de falhas e stream SSE com snapshots do processo e checkpoint.
4. Atualizar modelos e tela Angular administrativa para controles, progresso, contadores, eventos e revisão de falhas.
5. Adicionar cobertura de testes de controles, SSE, progresso, pausa, reconexão e processamento em lote.
6. Atualizar documentação operacional, variáveis para caminho do Python e execução do Collector pelo servidor.
