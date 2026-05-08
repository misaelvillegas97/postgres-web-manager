import { SqlRiskLevel } from '@postgres-web-manager/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Index('idx_audit_logs_workspace', ['workspaceId', 'createdAt'])
@Index('idx_audit_logs_connection', ['connectionId', 'createdAt'])
@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ name: 'connection_id', type: 'uuid', nullable: true })
  connectionId!: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({
    name: 'risk_level',
    type: 'varchar',
    length: 20,
    default: SqlRiskLevel.UNKNOWN,
  })
  riskLevel!: SqlRiskLevel;

  @Column({ type: 'text', nullable: true })
  resource!: string | null;

  @Column({ name: 'sql_preview', type: 'text', nullable: true })
  sqlPreview!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
