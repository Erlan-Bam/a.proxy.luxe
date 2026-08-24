import { existsSync } from 'fs';
import * as nodemailer from 'nodemailer';
import { UserService } from './user.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('UserService email logos', () => {
  const prisma = {
    user: {
      update: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
    },
  };
  const sendMail = jest.fn();
  const service = new UserService(prisma as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'mail-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  const expectEmbeddedLogo = () => {
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
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

    const [{ attachments }] = sendMail.mock.calls[0];
    expect(existsSync(attachments[0].path)).toBe(true);
  };

  it('embeds the logo in purchase emails', async () => {
    await service.sendProxyEmail('customer@example.com', 'ru');

    expectEmbeddedLogo();
  });

  it('embeds the logo in verification emails', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-id' });

    await service.sendVerificationEmail('customer@example.com', 'ru');

    expectEmbeddedLogo();
  });

  it('embeds the logo in expiration emails', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        end_date: '25.08.2026',
        user: {
          email: 'customer@example.com',
          lang: 'ru',
        },
      },
    ]);

    await service.notifyExpiringProxies();

    expectEmbeddedLogo();
  });

  it('embeds the logo in support emails', async () => {
    await service.sendSupportEmail({
      name: 'Customer',
      email: 'customer@example.com',
      support: 'Proxy',
      message: 'Help',
    });

    expectEmbeddedLogo();
  });
});
