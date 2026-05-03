import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto, TestConnectionDto } from '@postgres-web-manager/contracts';
import { CurrentUser, AuthenticatedUser } from '../../decorators/current-user.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@postgres-web-manager/contracts';

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
  create(@Body() dto: CreateConnectionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.connectionsService.create(dto, user.workspaceId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateConnectionDto>) {
    return this.connectionsService.update(id, dto);
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

  @Post(':id/unlock')
  unlock(@Param('id') id: string, @Body() body: { password: string }) {
    return this.connectionsService.unlock(id, body.password);
  }
}
