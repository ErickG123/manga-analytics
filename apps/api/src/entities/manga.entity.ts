import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Edition } from './edition.entity.js';

@Entity('mangas')
export class Manga {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  originalTitle?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  synopsis?: string | null;

  @Column({ type: 'text', nullable: true })
  author?: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Geral' })
  category!: string;

  @Column({ type: 'varchar', length: 50, default: '#dc2626' })
  accent!: string;

  @Column({ type: 'varchar', length: 10, default: 'MA' })
  initials!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  coverUrl?: string | null;

  @OneToMany(() => Edition, (edition) => edition.manga)
  editions!: Edition[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
