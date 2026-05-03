import { Injectable } from '@nestjs/common';
import { AuthTokens, LoginDto, RefreshTokenDto, UserProfile } from '@postgres-web-manager/contracts';

@Injectable()
export class AuthService {
  async login(_dto: LoginDto): Promise<AuthTokens> {
    throw new Error('Not implemented');
  }

  async refresh(_dto: RefreshTokenDto): Promise<AuthTokens> {
    throw new Error('Not implemented');
  }

  async logout(_dto: RefreshTokenDto): Promise<void> {
    throw new Error('Not implemented');
  }

  async getProfile(_userId: string): Promise<UserProfile> {
    throw new Error('Not implemented');
  }
}
