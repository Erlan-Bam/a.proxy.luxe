import {
  Controller,
  Get,
  UseGuards,
  Request,
  Post,
  Body,
  Delete,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { User } from '@prisma/client';
import { AddBalanceDTO } from './dto/add-balance.dto';
import { RemoveBalanceDTO } from './dto/remove-balance.dto';
import { BanUserDTO } from './dto/ban-user.dto';
import { AddPromocodeDTO } from './dto/add-promo.dto';
import { SupportMessageDto } from './dto/send-support.dto';

@Controller('v1/user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Request() request) {
    const user = request.user as User;

    return {
      email: user.email,
      balance: user.balance,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  @Post('send-verification')
  @UseGuards(AuthGuard('jwt'))
  async sendVerificationEmail(@Request() request) {
    const lang =
      request.headers['accept-language']
        ?.split(',')[0]
        ?.split('-')[0]
        ?.toLowerCase() || 'en';
    return this.userService.sendVerificationEmail(request.user.email, lang);
  }

  @Post('verify')
  async verifyCode(@Body() data: { code: string; email: string }) {
    return this.userService.setVerify(data.email, data.code);
  }

  @Get('info')
  @UseGuards(AuthGuard('jwt'))
  async getUsersInfo(@Request() request) {
    return this.userService.getUsersInfo(request.user);
  }

  @Post('add-balance')
  @UseGuards(AuthGuard('jwt'))
  async addBalance(@Body() data: AddBalanceDTO, @Request() req) {
    data.user = req.user;
    return this.userService.addBalance(data);
  }

  @Post('remove-balance')
  @UseGuards(AuthGuard('jwt'))
  async removeBalance(@Body() data: RemoveBalanceDTO, @Request() req) {
    data.user = req.user;
    return this.userService.removeBalance(data);
  }

  @Post('ban')
  @UseGuards(AuthGuard('jwt'))
  async banUser(@Body() data: BanUserDTO, @Request() req) {
    data.user = req.user;
    return this.userService.banUser(data);
  }

  @Post('promocode')
  @UseGuards(AuthGuard('jwt'))
  async addPromocode(@Body() data: AddPromocodeDTO, @Request() req) {
    data.user = req.user;
    return this.userService.addPromocode(data);
  }

  @Get('promocode')
  @UseGuards(AuthGuard('jwt'))
  async getPromocode(@Request() req) {
    return this.userService.getPromocode(req.user);
  }

  @Delete('promocode/delete/:code')
  @UseGuards(AuthGuard('jwt'))
  async deletePromocode(@Request() req, @Param('code') code: string) {
    return this.userService.deletePromocode(req.user, code);
  }

  @Post('send-support')
  async sendSupportEmail(@Body() data: SupportMessageDto) {
    return this.userService.sendSupportEmail(data);
  }
}
