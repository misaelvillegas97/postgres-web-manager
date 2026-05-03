import { Injectable } from '@nestjs/common';
import {
  ConnectionProfile,
  CreateConnectionDto,
  TestConnectionDto,
  TestConnectionResult,
} from '@postgres-web-manager/contracts';

@Injectable()
export class ConnectionsService {
  async findAll(): Promise<ConnectionProfile[]> {
    throw new Error('Not implemented');
  }

  async findOne(_id: string): Promise<ConnectionProfile> {
    throw new Error('Not implemented');
  }

  async create(_dto: CreateConnectionDto): Promise<ConnectionProfile> {
    throw new Error('Not implemented');
  }

  async update(_id: string, _dto: Partial<CreateConnectionDto>): Promise<ConnectionProfile> {
    throw new Error('Not implemented');
  }

  async remove(_id: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async test(_dto: TestConnectionDto): Promise<TestConnectionResult> {
    throw new Error('Not implemented');
  }
}
