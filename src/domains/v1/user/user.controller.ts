import {
  Controller,
  Get,
  UseGuards,
  Request,
  Post,
  Body,
  Delete,
  Param,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { User } from '@prisma/client';
import { AddBalanceDTO } from './dto/add-balance.dto';
import { RemoveBalanceDTO } from './dto/remove-balance.dto';
import { BanUserDTO } from './dto/ban-user.dto';
import { AddPromocodeDTO } from './dto/add-promo.dto';
import { SupportMessageDto } from './dto/send-support.dto';
import { AddAuthDto } from './dto/add-auth.dto';
import { ProductService } from 'src/domains/product/product.service';
import { UpdateListDto } from './dto/update-list.dto';
import { PayoutPartner } from './dto/payout-partner.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { FinishPayoutDto } from './dto/finish-payout.dto';

@Controller('v1/user')
export class UserController {
  constructor(
    private userService: UserService,
    private productService: ProductService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Request() request) {
    const user = request.user as User;
    const coupon = await this.userService.getCouponByUserId(user.id);

    return {
      id: user.id,
      email: user.email,
      balance: user.balance,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      coupon_code: coupon?.code,
    };
  }

  @Get('coupon/check-valid/:promocode')
  @UseGuards(AuthGuard('jwt'))
  async checkValidCoupon(@Param('promocode') promocode: string) {
    return await this.userService.checkValidCoupon(promocode);
  }

  @Post('add-auth')
  @UseGuards(AuthGuard('jwt'))
  async addAuth(@Body() body: AddAuthDto) {
    return await this.userService.addAuthorization(body);
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

  @Post('partner/payout')
  @UseGuards(AuthGuard('jwt'))
  async payoutPartner(@Body() body: PayoutPartner, @Request() request) {
    body.user = request.user as User;
    return await this.userService.payoutPartner(body);
  }

  @Get('partner/details')
  @UseGuards(AuthGuard('jwt'))
  async getPartnerDetails(@Request() request) {
    return await this.userService.getPartnerDetails(request.user.id);
  }

  @Get('admin/payout-requests')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  async getPayoutRequests() {
    return await this.userService.getPayoutRequests();
  }

  @Post('admin/finish-payout')
  async finishPayoutRequest(@Body() data: FinishPayoutDto) {
    return await this.userService.finishPayoutRequest(data.id, data.status);
  }

  @Post('ban')
  @UseGuards(AuthGuard('jwt'))
  async banUser(@Body() data: BanUserDTO, @Request() req) {
    data.user = req.user;
    return this.userService.banUser(data);
  }
  @Get('currency')
  async getCurrency() {
    return await this.userService.getCurrency();
  }

  @Post('unban')
  @UseGuards(AuthGuard('jwt'))
  async unbanUser(@Body() data: BanUserDTO, @Request() req) {
    data.user = req.user;
    return this.userService.unbanUser(data);
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

  @Delete('delete-list/:listId/:packageKey')
  @UseGuards(AuthGuard('jwt'))
  async deleteList(
    @Param('listId') listId: number,
    @Param('packageKey') packageKey: string,
  ) {
    return await this.productService.deleteList(listId, packageKey);
  }

  @Patch('update-list')
  @UseGuards(AuthGuard('jwt'))
  async updateList(@Body() body: UpdateListDto) {
    return await this.productService.updateList(
      body.listId,
      body.packageKey,
      body.title,
      body.rotation,
    );
  }

  @Post('send-support')
  async sendSupportEmail(@Body() data: SupportMessageDto) {
    return this.userService.sendSupportEmail(data);
  }
}
