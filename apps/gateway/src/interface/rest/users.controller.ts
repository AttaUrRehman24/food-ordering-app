import {
  Controller,
  Delete,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard, type GatewayUser } from '../../auth/auth.guards';
import { GatewayGrpcClients } from '../../infrastructure/grpc/clients';
import { mapUser } from './mappers';
import { NotFound, Unauthorized } from './swagger.constants';
import { MessageResponseDto, UserProfileDto } from './swagger.models';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(private readonly grpc: GatewayGrpcClients) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'User profile', type: UserProfileDto })
  @ApiResponse(Unauthorized)
  async me(@Req() req: Request & { user?: GatewayUser }) {
    const profile = await this.grpc.callIdentity.getMe({ userId: req.user!.userId });
    return mapUser(profile);
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'List my sessions',
    description: 'Devices/browsers with active refresh families.',
  })
  @ApiResponse({ status: 200, description: 'Session list' })
  @ApiResponse(Unauthorized)
  async sessions(@Req() req: Request & { user?: GatewayUser }) {
    const res = await this.grpc.callIdentity.listSessions({ userId: req.user!.userId });
    return (res.sessions ?? []).map((s) => ({
      id: s.id,
      device: s.device,
      ip: s.ip,
      createdAt: s.createdAt,
      lastActive: s.lastActive,
      current: s.current,
    }));
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Revoke a session' })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiOkResponse({ description: 'Session revoked', type: MessageResponseDto })
  @ApiResponse(NotFound)
  @ApiResponse(Unauthorized)
  async revoke(
    @Req() req: Request & { user?: GatewayUser },
    @Param('sessionId') sessionId: string,
  ) {
    await this.grpc.callIdentity.revokeSession({
      userId: req.user!.userId,
      sessionId,
    });
    return { message: 'Session revoked' };
  }
}
