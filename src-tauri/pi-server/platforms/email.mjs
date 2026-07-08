/**
 * Email adapter (SMTP via nodemailer). Outbound only — no inbound path.
 */
import nodemailer from 'nodemailer'

function makeTransport(platform) {
  const port = Number(platform.values.smtpPort || 465)
  return nodemailer.createTransport({
    host: platform.values.smtpHost.trim(),
    port,
    secure: port === 465,
    auth: {
      user: platform.values.username.trim(),
      pass: platform.values.password,
    },
  })
}

export default {
  id: 'email',
  inboundMode: 'none',

  async validateConnection(platform) {
    await makeTransport(platform).verify()
  },

  async dispatch(platform, text) {
    await makeTransport(platform).sendMail({
      from: platform.values.username.trim(),
      to: platform.values.to.trim(),
      subject: 'S-Loop Notification',
      text,
    })
  },
}
