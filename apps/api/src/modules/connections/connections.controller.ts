import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto, TestConnectionDto } from '@postgres-web-manager/contracts';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  findAll() {
    return this.connectionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.connectionsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateConnectionDto) {
    return this.connectionsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateConnectionDto>) {
    return this.connectionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.connectionsService.remove(id);
  }

  @Post('test')
  test(@Body() dto: TestConnectionDto) {
    return this.connectionsService.test(dto);
  }
}
