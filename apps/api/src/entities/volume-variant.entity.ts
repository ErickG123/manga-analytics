import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Volume } from './volume.entity.js';
import { VolumePrice } from './volume-price.entity.js';
import { PriceObservation } from './price-observation.entity.js';

@Entity('volume_variants')
@Index('IDX_volume_variants_volume_key_unique', ['volumeId', 'variantKey'], { unique: true })
export class VolumeVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  volumeId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  variantKey!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  releaseDate?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  releaseDatePrecision!: 'day' | 'month' | 'year' | 'unknown';

  @Column({ type: 'varchar', length: 30, default: 'unknown' })
  releaseStatus!: 'released' | 'planned' | 'unknown';

  @Column({ type: 'int', nullable: true })
  releaseYear?: number | null;

  @Column({ type: 'int', nullable: true })
  releaseMonth?: number | null;

  @Column({ type: 'int', nullable: true })
  releaseDay?: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  isbn13?: string | null;

  @Column({ type: 'int', nullable: true })
  pageCount?: number | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  coverUrl?: string | null;

  @ManyToOne(() => Volume, (volume) => volume.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volumeId' })
  volume!: Volume;

  @OneToMany(() => VolumePrice, (price) => price.variant)
  prices!: VolumePrice[];

  @OneToMany(() => PriceObservation, (observation) => observation.variant)
  observations!: PriceObservation[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
