import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Volume } from './volume.entity.js';
import { VolumeVariant } from './volume-variant.entity.js';

@Entity('price_observations')
export class PriceObservation {
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

  @Column({ type: 'varchar', length: 50, default: 'cover' })
  priceType!: 'cover' | 'retail';

  @Column({ type: 'varchar', length: 100, default: 'bbm' })
  sourceId!: string;

  @Column({ type: 'timestamp with time zone' })
  observedAt!: Date;

  @ManyToOne(() => Volume, (volume) => volume.observations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volumeId' })
  volume!: Volume;

  @ManyToOne(() => VolumeVariant, (variant) => variant.observations, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variantId' })
  variant?: VolumeVariant | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
