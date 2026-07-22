import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AuthGuard,
  REFRESH_COOKIE,
  getClientIp,
  type GatewayUser,
} from '../../auth/auth.guards';
import { GatewayGrpcClients } from '../../infrastructure/grpc/clients';
import { GatewayRateLimiter } from '../../infrastructure/redis/rate-limiter';
import { LoginDto, OtpRequestDto, OtpVerifyDto, RegisterDto } from './dto';
import { clearRefreshCookie, mapAuthTokens, setRefreshCookie } from './mappers';
import {
  BadRequest,
  TooManyRequests,
  Unauthorized,
} from './swagger.constants';
import {
  AuthTokensResponseDto,
  MessageResponseDto,
  OtpRequestResponseDto,
} from './swagger.models';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly grpc: GatewayGrpcClients,
    @Inject(GatewayRateLimiter) private readonly limiter: GatewayRateLimiter,
  ) {}

  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register a customer',
    description:
      'Creates a customer account. Sets httpOnly refresh cookie. Admin accounts cannot self-register.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'Registered — returns accessToken + user; refresh cookie set',
    type: AuthTokensResponseDto,
  })
  @ApiResponse(BadRequest)
  @ApiResponse(TooManyRequests)
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.assertRate('auth_register', getClientIp(req), 20, 600);
    const tokens = await this.grpc.callIdentity.register(body);
    setRefreshCookie(res, tokens.refreshToken);
    return mapAuthTokens(tokens);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Password login',
    description: 'Authenticate with email/phone + password. Returns JWT access token and sets refresh cookie.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Authenticated', type: AuthTokensResponseDto })
  @ApiResponse(Unauthorized)
  @ApiResponse(TooManyRequests)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.assertRate('auth_login', getClientIp(req), 30, 600);
    const tokens = await this.grpc.callIdentity.login(body);
    setRefreshCookie(res, tokens.refreshToken);
    return mapAuthTokens(tokens);
  }

  @Post('otp/request')
  @ApiOperation({
    summary: 'Request email OTP',
    description:
      'Always delivers OTP by email (SMTP). Response is generic even if the identifier is unknown (anti-enumeration).',
  })
  @ApiBody({ type: OtpRequestDto })
  @ApiOkResponse({
    description: 'OTP dispatched (or silently skipped for unknown users)',
    type: OtpRequestResponseDto,
  })
  @ApiResponse(TooManyRequests)
  async requestOtp(@Body() body: OtpRequestDto, @Req() req: Request) {
    await this.assertRate('auth_otp_request', getClientIp(req), 10, 600);
    return this.grpc.callIdentity.requestOtp(body);
  }

  @Post('otp/verify')
  @ApiOperation({
    summary: 'Verify OTP and login',
    description: 'Single-use code; max attempts enforced. Issues access + refresh tokens on success.',
  })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkResponse({ description: 'Authenticated via OTP', type: AuthTokensResponseDto })
  @ApiResponse(Unauthorized)
  @ApiResponse(TooManyRequests)
  async verifyOtp(
    @Body() body: OtpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.assertRate('auth_otp_verify', getClientIp(req), 20, 600);
    const tokens = await this.grpc.callIdentity.verifyOtp(body);
    setRefreshCookie(res, tokens.refreshToken);
    return mapAuthTokens(tokens);
  }

  @Post('refresh')
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Uses httpOnly `refresh_token` cookie (or body.refreshToken). Rotates refresh token family.',
  })
  @ApiOkResponse({ description: 'New access token + user profile', type: AuthTokensResponseDto })
  @ApiResponse(Unauthorized)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      (req.body as { refreshToken?: string })?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokens = await this.grpc.callIdentity.refresh({ refreshToken });
    setRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      user: mapAuthTokens(tokens).user,
    };
  }

  @Post('logout')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Logout current session', description: 'Revokes refresh + access jti; clears cookie.' })
  @ApiOkResponse({ description: 'Logged out', type: MessageResponseDto })
  @ApiResponse(Unauthorized)
  async logout(
    @Req() req: Request & { user?: GatewayUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? '';
    await this.grpc.callIdentity.logout({
      accessJti: req.user!.jti,
      refreshToken,
    });
    clearRefreshCookie(res);
    return { message: 'Logged out' };
  }

  @Post('logout-all')
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Revoke all sessions', description: 'Logs the user out everywhere.' })
  @ApiOkResponse({ description: 'All sessions revoked', type: MessageResponseDto })
  @ApiResponse(Unauthorized)
  async logoutAll(
    @Req() req: Request & { user?: GatewayUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.grpc.callIdentity.logoutAll({ userId: req.user!.userId });
    clearRefreshCookie(res);
    return { message: 'All sessions revoked' };
  }

  private async assertRate(
    scope: string,
    id: string,
    limit: number,
    window: number,
  ): Promise<void> {
    const ok = await this.limiter.hit(scope, id, limit, window);
    if (!ok) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
