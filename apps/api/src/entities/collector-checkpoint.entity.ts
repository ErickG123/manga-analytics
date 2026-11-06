import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('collector_checkpoints')
export class CollectorCheckpoint {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  sourceId!: string;

  @PrimaryColumn({ type: 'varchar', length: 50 })
  scope!: string;

  @Column({ type: 'varchar', length: 30, default: 'backfill' })
  mode!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: 'pending' | 'running' | 'completed' | 'failed';

  @Column({ type: 'int', default: 1 })
  currentPage!: number;

  @Column({ type: 'int', default: 0 })
  currentOffset!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastExternalId?: string | null;

  @Column({ type: 'int', default: 0 })
  processedCount!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  syncCursorAt?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  syncTargetAt?: Date | null;

  @Column({ type: 'int', default: 300 })
  syncOverlapSeconds!: number;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt?: Date | null;
}
