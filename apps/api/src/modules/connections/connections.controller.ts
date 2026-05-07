import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import type {
  CreateConnectionDto,
  TestConnectionDto,
} from '@postgres-web-manager/contracts';
import { UserRole } from '@postgres-web-manager/contracts';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { Roles } from '../../decorators/roles.decorator';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.connectionsService.findAll(user.workspaceId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.connectionsService.findOne(id, user.workspaceId);
  }

  @Post()
  create(
    @Body() dto: CreateConnectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectionsService.create(dto, user.workspaceId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateConnectionDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectionsService.update(id, dto, user.workspaceId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.connectionsService.remove(id, user.workspaceId);
  }

  @Post('test')
  test(@Body() dto: TestConnectionDto) {
    return this.connectionsService.test(dto);
  }

  @Post(':id/test')
  async testSaved(
    @Param('id') id: string,
    @Body() body: { password?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const profile = await this.connectionsService.findOne(id, user.workspaceId);
    const password = body.password ?? this.connectionsService.getPassword(id);
    if (!password) {
      throw new BadRequestException(
        'Password is required to test this connection',
      );
    }

    return this.connectionsService.test({
      host: profile.host,
      port: profile.port,
      database: profile.database,
      username: profile.username,
      password,
      sslMode: profile.sslMode,
    });
  }

  @Get(':id/status')
  status(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.connectionsService.status(id, user.workspaceId);
  }

  @Post(':id/unlock')
  unlock(
    @Param('id') id: string,
    @Body() body: { password?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectionsService.unlock(id, body.password, user.workspaceId);
  }
}
