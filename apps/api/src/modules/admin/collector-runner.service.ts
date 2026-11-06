import { spawn } from 'node:child_process';
import { AppDataSource } from '../../config/data-source.js';
import type {
  CollectorBackfillOptions,
  CollectorRunnerSnapshot,
} from './models/collector-runner.model.js';

const BATCH_SIZE = 100;
const BETWEEN_BATCHES_MS = 30_000;
const OUTPUT_LINES_LIMIT = 30;

export class CollectorRunnerService {
  private active = false;
  private pauseRequested = false;
  private wakeDelay: (() => void) | null = null;
  private state: CollectorRunnerSnapshot = {
    status: 'idle',
    mode: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
    batchNumber: 0,
    lastExitCode: null,
    message: null,
    recentOutput: [],
  };

  snapshot(): CollectorRunnerSnapshot {
    return { ...this.state, recentOutput: [...this.state.recentOutput] };
  }

  start(options: CollectorBackfillOptions = {}): boolean {
    if (this.active) return false;

    this.active = true;
    this.pauseRequested = false;
    this.state = {
      status: 'starting',
      mode: options.forceReparse ? 'reparse' : 'resume',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      batchNumber: 0,
      lastExitCode: null,
      message: options.resetCheckpoint
        ? 'Reiniciando o checkpoint antes do reprocessamento.'
        : 'Preparando o próximo lote a partir do checkpoint salvo.',
      recentOutput: [],
    };

    void this.runLoop(options);
    return true;
  }

  pause(): boolean {
    if (!this.active || this.pauseRequested) return false;
    this.pauseRequested = true;
    this.state.status = 'pausing';
    this.state.message = 'A pausa será aplicada após o lote atual.';
    this.touch();
    this.wakeDelay?.();
    return true;
  }

  async pauseAndWait(): Promise<void> {
    if (!this.active) return;
    this.pause();
    while (this.active) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private async runLoop(options: CollectorBackfillOptions): Promise<void> {
    let firstBatch = true;
    try {
      while (!this.pauseRequested) {
        this.state.status = 'running';
        this.state.batchNumber += 1;
        this.state.message = `Executando o lote ${this.state.batchNumber} (${BATCH_SIZE} fichas por página).`;
        this.touch();

        const args = [
          '-m',
          'collector.src.cli',
          'backfill',
          '--batch-size',
          String(BATCH_SIZE),
          '--resume',
        ];
        if (firstBatch && options.resetCheckpoint) args.push('--reset-checkpoint');
        if (options.forceReparse) args.push('--force-reparse');

        const exitCode = await this.runBatch(args);
        this.state.lastExitCode = exitCode;
        firstBatch = false;

        const checkpointStatus = await this.readCheckpointStatus();
        if (this.pauseRequested) {
          this.state.status = 'paused';
          this.state.message = 'Pausado após confirmar o lote; o checkpoint foi preservado.';
          break;
        }

        if (checkpointStatus === 'completed') {
          this.state.status = 'completed';
          this.state.message = 'O Collector chegou ao fim do catálogo.';
          break;
        }

        if (exitCode !== 0) {
          const sourceStatus = await this.readSourceStatus();
          this.state.status =
            sourceStatus === 'blocked'
              ? 'blocked'
              : sourceStatus === 'suspended'
                ? 'suspended'
                : 'failed';
          this.state.message =
            this.state.recentOutput.at(-1) || `O Collector encerrou com código ${exitCode}.`;
          break;
        }

        this.state.status = 'waiting';
        this.state.message = 'Lote confirmado; aguardando 30 segundos antes da próxima página.';
        this.touch();
        await this.waitBetweenBatches();
      }

      if (this.pauseRequested && this.state.status !== 'paused') {
        this.state.status = 'paused';
        this.state.message = 'Pausado com o checkpoint preservado.';
      }
    } catch (error) {
      this.state.status = 'failed';
      this.state.message = error instanceof Error ? error.message : String(error);
      this.appendOutput(this.state.message);
    } finally {
      this.active = false;
      this.pauseRequested = false;
      this.wakeDelay = null;
      this.touch();
    }
  }

  protected runBatch(args: string[]): Promise<number> {
    const executable =
      process.env.COLLECTOR_PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'py' : 'python3');
    const projectRoot = process.env.COLLECTOR_PROJECT_ROOT || process.cwd();
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: projectRoot,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let pending = '';
      const capture = (chunk: Buffer) => {
        pending += chunk.toString('utf8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) this.appendOutput(line);
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.once('error', reject);
      child.once('close', (code) => {
        if (pending.trim()) this.appendOutput(pending.trim());
        resolve(code ?? 1);
      });
    });
  }

  protected async readCheckpointStatus(): Promise<string | null> {
    const rows = await AppDataSource.query(
      'SELECT status FROM collector_checkpoints WHERE "sourceId" = $1 AND scope = $2',
      ['bbm', 'catalog'],
    );
    return rows[0]?.status ?? null;
  }

  protected async readSourceStatus(): Promise<string | null> {
    const rows = await AppDataSource.query(
      'SELECT status FROM collector_source_states WHERE "sourceId" = $1',
      ['bbm'],
    );
    return rows[0]?.status ?? null;
  }

  protected async waitBetweenBatches(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakeDelay = null;
        resolve();
      }, BETWEEN_BATCHES_MS);
      this.wakeDelay = () => {
        clearTimeout(timer);
        this.wakeDelay = null;
        resolve();
      };
    });
  }

  private appendOutput(line: string): void {
    if (!line.trim()) return;
    this.state.recentOutput = [...this.state.recentOutput, line.trim()].slice(-OUTPUT_LINES_LIMIT);
    this.touch();
  }

  private touch(): void {
    this.state.updatedAt = new Date().toISOString();
  }
}

export const collectorRunner = new CollectorRunnerService();
