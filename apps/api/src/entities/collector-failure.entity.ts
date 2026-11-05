import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('collector_failures')
@Index('IDX_collector_failures_status', ['sourceId', 'status', 'category'])
@Index('UQ_collector_failures_source_external_category', ['sourceId', 'externalId', 'category'], {
  unique: true,
})
export class CollectorFailure {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 255 })
  externalId!: string;

  @Column({ type: 'text', nullable: true })
  externalUrl!: string | null;

  @Column({ type: 'varchar', length: 30 })
  category!: string;

  @Column({ type: 'varchar', length: 30, default: 'needs_review' })
  status!: 'failed_retryable' | 'failed_permanent' | 'needs_review' | 'resolved';

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'int', nullable: true })
  lastHttpStatus!: number | null;

  @Column({ type: 'int', default: 1 })
  attempts!: number;

  @Column({ type: 'uuid', nullable: true })
  jobId!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt!: Date | null;
}
