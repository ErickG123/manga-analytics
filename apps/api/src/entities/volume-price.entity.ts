import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Volume } from './volume.entity.js';
import { VolumeVariant } from './volume-variant.entity.js';

@Entity('volume_prices')
export class VolumePrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  volumeId!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  variantId?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 10, default: 'BRL' })
  currency!: string;

  @Column({ type: 'varchar', length: 100, default: 'bbm' })
  sourceId!: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  observedAt?: Date | null;

  @ManyToOne(() => Volume, (volume) => volume.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volumeId' })
  volume!: Volume;

  @ManyToOne(() => VolumeVariant, (variant) => variant.prices, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variantId' })
  variant?: VolumeVariant | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
