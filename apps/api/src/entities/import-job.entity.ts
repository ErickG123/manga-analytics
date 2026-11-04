import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('import_jobs')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status!: 'pending' | 'running' | 'completed' | 'failed';

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
