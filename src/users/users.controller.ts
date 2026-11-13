import { Body, Controller, Get, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UsersService, type CreateUserInput } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() body: CreateUserInput) {
    return this.usersService.create(body);
  }
  @Get('')
  async findAll(
  ) {
    return this.usersService.findAll()
      }


  @Get(':id/bloom')
  async findWithBloom(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.findByIdWithBloom(id);
    response.status(result.found ? HttpStatus.OK : HttpStatus.NOT_FOUND);
    return result;
  }

  @Get(':id')
  async findDirect(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const result = await this.usersService.findByIdDirect(id);
    response.status(result.found ? HttpStatus.OK : HttpStatus.NOT_FOUND);
    return result;
  }
}
