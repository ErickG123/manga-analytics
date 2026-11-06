# SPEC-015: Console administrativo do Collector

## Objetivo

Permitir acompanhar e controlar uma coleta completa pela tela administrativa, sem deixar um script PowerShell aberto no terminal.

## Requisitos

1. A tela autenticada mostra estado do processo, página/posição do checkpoint, itens concluídos, total conhecido, percentual estimado, duração, falhas e fichas que exigem revisão.
2. O administrador pode iniciar/retomar um backfill de até 100 fichas por página, solicitar reparse completo desde o início e pausar com segurança após o lote atual.
3. A pausa preserva o checkpoint; retomar continua do último ponto confirmado.
4. Atualizações de execução chegam à tela por Server-Sent Events (SSE), com reconexão e consulta HTTP de fallback.
5. O backend inicia somente comandos predefinidos do Collector, sem aceitar shell commands ou argumentos arbitrários vindos do navegador.
6. Início e pausa exigem autenticação administrativa; execução simultânea é rejeitada e bloqueios/suspensões do BBM são mostrados sem tentativa de contorno.
7. Falhas de coleta e itens `needs_review` ficam visíveis no painel com link e mensagem armazenada.
8. O HTML retornado pelo BBM é processado em memória pelo Collector e não é persistido como conteúdo bruto.

## Fora de escopo

- Substituir Fastify por NestJS ou introduzir .NET/SignalR.
- Distribuir o worker entre várias máquinas ou orquestrar filas externas.
- Resolver automaticamente fichas marcadas para revisão manual.

## Critérios de aceite

- Iniciar a partir do admin executa o Collector Python real e cria jobs/checkpoints existentes.
- Pausar espera a conclusão do lote atual e retoma sem pular itens.
- Uma sessão admin recebe progresso SSE autenticado e atualiza percentual, último job e falhas.
- Só um worker pode coletar BBM por vez; um job ativo concorrente é recusado.
- O painel mantém informação útil após recarregar a página consultando estado persistido.
- Testes da API, UI e Collector passam e a aplicação compila.
