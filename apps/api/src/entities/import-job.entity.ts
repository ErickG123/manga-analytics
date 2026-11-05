import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('import_jobs')
@Index('UQ_import_jobs_running_source', ['sourceId'], {
  unique: true,
  where: `"status" = 'running' AND "runType" <> 'admin_trigger'`,
})
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status!:
    | 'pending'
    | 'running'
    | 'completed'
    | 'completed_with_errors'
    | 'failed'
    | 'interrupted'
    | 'rate_limited'
    | 'blocked';

  @Column({ type: 'varchar', length: 30, default: 'import' })
  runType!: string;

  @Column({ type: 'text', nullable: true })
  terminationReason?: string | null;

  @Column({ type: 'int', default: 0 })
  resumeCount!: number;

  @Column({ type: 'jsonb', nullable: true })
  metrics?: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  checkpointPage?: number | null;

  @Column({ type: 'int', nullable: true })
  checkpointOffset?: number | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'int', default: 0 })
  recordsProcessed!: number;

  @Column({ type: 'int', default: 0 })
  recordsCreated!: number;

  @Column({ type: 'int', default: 0 })
  recordsUpdated!: number;

  @Column({ type: 'int', default: 0 })
  recordsFailed!: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
