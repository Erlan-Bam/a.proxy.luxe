import { join } from 'path';

export const EMAIL_LOGO_CID = 'proxy-luxe-logo';

export const getEmailLogoAttachment = () => ({
  filename: 'proxy-luxe-logo.png',
  path: join(process.cwd(), 'assets', 'email-logo.png'),
  cid: EMAIL_LOGO_CID,
  contentDisposition: 'inline' as const,
});
