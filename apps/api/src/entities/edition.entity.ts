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
import { Manga } from './manga.entity.js';
import { Publisher } from './publisher.entity.js';
import { Volume } from './volume.entity.js';

@Entity('editions')
@Index('IDX_editions_manga_publisher_unique', ['mangaId', 'publisherId'], { unique: true })
export class Edition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  mangaId!: string;

  @Index()
  @Column({ type: 'uuid' })
  publisherId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, default: 'Tankobon' })
  format!: string;

  @Column({ type: 'varchar', length: 50, default: 'ongoing' })
  status!: string;

  @ManyToOne(() => Manga, (manga) => manga.editions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mangaId' })
  manga!: Manga;

  @ManyToOne(() => Publisher, (publisher) => publisher.editions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'publisherId' })
  publisher!: Publisher;

  @OneToMany(() => Volume, (volume) => volume.edition)
  volumes!: Volume[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
