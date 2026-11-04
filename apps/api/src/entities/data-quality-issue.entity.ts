import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type IssueEntityType = 'manga' | 'edition' | 'volume' | 'price';
export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueStatus = 'open' | 'resolved' | 'ignored';

@Entity('data_quality_issues')
export class DataQualityIssue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  entityType!: IssueEntityType;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  entityId!: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  ruleCode!: string;

  @Column({ type: 'varchar', length: 20, default: 'warning' })
  severity!: IssueSeverity;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: IssueStatus;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sourceId!: string | null;

  @CreateDateColumn()
  detectedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
