import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { existsSync } from 'fs';
import { AuthService } from './auth.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('AuthService password reset links', () => {
  const user = {
    id: 'user-id',
    email: 'user@example.com',
    password: '',
    change_password_code: 'signed-reset-token',
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_TOKEN_SECRET') return 'test-secret';
      if (key === 'FRONTEND_URL') return 'https://proxy.luxe';
      return undefined;
    }),
  };
  const sendMail = jest.fn();
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    user.password = await bcrypt.hash('old-password', 4);
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);
    jwtService.signAsync.mockResolvedValue('signed-reset-token');
    jwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      purpose: 'password-reset',
    });
    sendMail.mockResolvedValue({ messageId: 'mail-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    service = new AuthService(
      prisma as any,
      {} as any,
      jwtService as any,
      configService as any,
      {} as any,
    );
  });

  it('sends a localized one-hour reset link instead of a numeric code', async () => {
    await service.sendResetPassword({ email: user.email, lang: 'ru' }, 'ru');

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: user.id,
        email: user.email,
        purpose: 'password-reset',
      },
      { secret: 'test-secret', expiresIn: '1h' },
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { change_password_code: 'signed-reset-token' },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          'https://proxy.luxe/ru/forgot-password?token=signed-reset-token',
        ),
        html: expect.stringContaining('cid:proxy-luxe-logo'),
        attachments: [
          expect.objectContaining({
            cid: 'proxy-luxe-logo',
            filename: 'proxy-luxe-logo.png',
            contentDisposition: 'inline',
          }),
        ],
      }),
    );

    const [{ attachments, html }] = sendMail.mock.calls[0];
    expect(html).toContain(
      'https://proxy.luxe/ru/forgot-password?token=signed-reset-token',
    );
    expect(html).toContain('cid:proxy-luxe-logo');
    expect(existsSync(attachments[0].path)).toBe(true);
  });

  it('changes the password once and clears the stored token', async () => {
    await service.resetPassword({
      token: 'signed-reset-token',
      newPassword: 'new-password',
    });

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('signed-reset-token', {
      secret: 'test-secret',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        password: expect.any(String),
        change_password_code: null,
      },
    });
  });

  it('rejects an invalid or expired token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('expired'));

    await expect(
      service.resetPassword({
        token: 'expired-token',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      message: 'Invalid or expired reset token',
      status: 400,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
