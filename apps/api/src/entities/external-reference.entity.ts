import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity('external_references')
@Unique(['sourceId', 'entityType', 'externalId'])
export class ExternalReference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  sourceId!: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  entityType!: 'manga' | 'edition' | 'volume' | 'publisher';

  @Index()
  @Column({ type: 'uuid' })
  entityId!: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  externalId!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  externalUrl?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sourceModifiedAt?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceContentHash?: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastSyncedAt?: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  syncStatus!: 'pending' | 'complete' | 'failed';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
