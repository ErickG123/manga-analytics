import { describe, expect, it, vi } from 'vitest';
import { CollectorRunnerService } from './collector-runner.service.js';

class ControlledCollectorRunner extends CollectorRunnerService {
  args: string[] = [];
  private resolveBatch: ((exitCode: number) => void) | null = null;

  protected override runBatch(args: string[]): Promise<number> {
    this.args = args;
    return new Promise((resolve) => {
      this.resolveBatch = resolve;
    });
  }

  protected override async readCheckpointStatus(): Promise<string> {
    return 'pending';
  }

  protected override async readSourceStatus(): Promise<string> {
    return 'active';
  }

  finishBatch(exitCode = 0): void {
    this.resolveBatch?.(exitCode);
  }
}

describe('CollectorRunnerService', () => {
  it('roda páginas de 100 e pausa somente depois de confirmar o lote atual', async () => {
    const runner = new ControlledCollectorRunner();

    expect(runner.start({ resetCheckpoint: true, forceReparse: true })).toBe(true);
    expect(runner.start()).toBe(false);
    await vi.waitFor(() => expect(runner.snapshot().status).toBe('running'));
    expect(runner.args).toEqual(
      expect.arrayContaining([
        '--batch-size',
        '100',
        '--resume',
        '--reset-checkpoint',
        '--force-reparse',
      ]),
    );

    expect(runner.pause()).toBe(true);
    expect(runner.snapshot().status).toBe('pausing');
    runner.finishBatch();
    await vi.waitFor(() => expect(runner.snapshot().status).toBe('paused'));
    expect(runner.snapshot().message).toContain('checkpoint foi preservado');
  });

  it('encerra o loop se o Collector retornar erro', async () => {
    const runner = new ControlledCollectorRunner();
    runner.start();
    await vi.waitFor(() => expect(runner.snapshot().status).toBe('running'));

    runner.finishBatch(1);
    await vi.waitFor(() => expect(runner.snapshot().status).toBe('failed'));
    expect(runner.snapshot().lastExitCode).toBe(1);
  });
});
