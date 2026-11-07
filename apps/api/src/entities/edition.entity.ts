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
  Check,
} from 'typeorm';
import { Manga } from './manga.entity.js';
import { Publisher } from './publisher.entity.js';
import { Volume } from './volume.entity.js';

@Entity('editions')
@Check(
  'CHK_editions_format_type',
  `"formatType" IN ('regular', 'two_in_one', 'three_in_one', 'omnibus', 'definitive', 'deluxe', 'box_set', 'digital_edition', 'other', 'unknown')`,
)
@Index(
  'IDX_editions_manga_publisher_source_key_unique',
  ['mangaId', 'publisherId', 'sourceEditionKey'],
  {
    unique: true,
  },
)
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

  @Column({ type: 'varchar', length: 100, default: 'Não informado' })
  format!: string;

  @Column({ type: 'varchar', length: 120, default: 'default' })
  sourceEditionKey!: string;

  @Column({ type: 'varchar', length: 30, default: 'unknown' })
  formatType!: string;

  @Column({ type: 'text', nullable: true })
  formatDetails?: string | null;

  @Column({ type: 'smallint', nullable: true })
  volumesPerBook?: number | null;

  @Column({ type: 'text', nullable: true })
  formatEvidence?: string | null;

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
