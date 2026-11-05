import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('collector_source_states')
export class CollectorSourceState {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'suspended' | 'blocked';

  @Column({ type: 'timestamp with time zone', nullable: true })
  suspendedUntil!: Date | null;

  @Column({ type: 'text', nullable: true })
  suspensionReason!: string | null;

  @Column({ type: 'int', nullable: true })
  lastHttpStatus!: number | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastFailureAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
