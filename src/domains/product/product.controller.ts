import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CalcRequestDTO, CalcResidentRequestDTO } from './dto/request.dto';
import { AuthGuard } from '@nestjs/passport';
import { UserType } from '@prisma/client';

@Controller('/v1/products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('/references')
  async getReference() {
    return await this.productService.getProductReference();
  }

  @Get('/references/:type')
  async getReferenceByType(@Param('type') type: string) {
    return await this.productService.getProductReferenceByType(type);
  }

  @Get('geo/reference')
  async getGeoReference() {
    return await this.productService.getGeoReference();
  }

  @Post('/calc')
  async getCalc(@Body() body: CalcRequestDTO) {
    return await this.productService.getCalc(body);
  }

  @Post('/calc/resident')
  async getCalcResident(@Body() body: CalcResidentRequestDTO) {
    return await this.productService.getCalcResident(body);
  }

  @Get('active-list/:type')
  @UseGuards(AuthGuard('jwt'))
  async getActiveProxyList(@Param('type') type: string, @Request() req) {
    return await this.productService.getActiveProxyList(req.user.id, type);
  }

  @Get('admin/user-proxy/:type')
  @UseGuards(AuthGuard('jwt'))
  async getUserProxyList(
    @Query('userId') userId: string,
    @Param('type') type: string,
    @Request() request,
  ) {
    if (request.user.role !== UserType.ADMIN) {
      throw new ForbiddenException('Access denied: Admins only');
    }
    return await this.productService.getActiveProxyList(userId, type);
  }
}
