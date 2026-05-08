import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ConnectionAccessMode = 'read-only' | 'read-write';
export type ConnectionSslMode =
  | 'disable'
  | 'prefer'
  | 'require'
  | 'verify-ca'
  | 'verify-full';

@Entity({ name: 'connection_profiles' })
export class ConnectionProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  host!: string;

  @Column({ type: 'integer', default: 5432 })
  port!: number;

  @Column({ type: 'varchar', length: 255 })
  database!: string;

  @Column({ type: 'varchar', length: 255 })
  username!: string;

  @Column({ name: 'password_encrypted', type: 'text', nullable: true })
  passwordEncrypted!: string | null;

  @Column({ name: 'ssl_mode', type: 'varchar', length: 20, default: 'prefer' })
  sslMode!: ConnectionSslMode;

  @Column({
    name: 'access_mode',
    type: 'varchar',
    length: 10,
    default: 'read-write',
  })
  accessMode!: ConnectionAccessMode;

  @Column({ name: 'max_rows', type: 'integer', default: 1000 })
  maxRows!: number;

  @Column({ name: 'statement_timeout_ms', type: 'integer', default: 30000 })
  statementTimeoutMs!: number;

  @Column({ name: 'save_password', type: 'boolean', default: false })
  savePassword!: boolean;

  @Column({ type: 'varchar', length: 7, nullable: true })
  color!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
