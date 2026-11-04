import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Edition } from './edition.entity.js';
import { VolumePrice } from './volume-price.entity.js';
import { PriceObservation } from './price-observation.entity.js';

@Entity('volumes')
export class Volume {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  editionId!: string;

  @Index()
  @Column({ type: 'int' })
  number!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  isbn13?: string | null;

  @Column({ type: 'int', nullable: true })
  pageCount?: number | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  coverUrl?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  releaseDate?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  releaseDatePrecision!: 'day' | 'month' | 'year' | 'unknown';

  @Index()
  @Column({ type: 'varchar', length: 30, default: 'unknown' })
  releaseStatus!: 'released' | 'planned' | 'unknown';

  @Column({ type: 'int', nullable: true })
  releaseYear?: number | null;

  @Column({ type: 'int', nullable: true })
  releaseMonth?: number | null;

  @Column({ type: 'int', nullable: true })
  releaseDay?: number | null;

  @ManyToOne(() => Edition, (edition) => edition.volumes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'editionId' })
  edition!: Edition;

  @OneToMany(() => VolumePrice, (price) => price.volume)
  prices!: VolumePrice[];

  @OneToMany(() => PriceObservation, (obs) => obs.volume)
  observations!: PriceObservation[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
