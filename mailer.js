// mailer.js — Nodemailer transporter + OTP generation + email sending
require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// ── Transporter ───────────────────────────────────────────────────────────────
// Works with Gmail SMTP and Mailtrap (swap values in .env)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_PORT === '465', // true only for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── generateOTP() ─────────────────────────────────────────────────────────────
// Returns a cryptographically random 6-digit string e.g. "048321"
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// ── sendOTPEmail() ────────────────────────────────────────────────────────────
// Sends a branded HTML email containing the OTP code
// Returns { success: true } or { success: false, error: string }
async function sendOTPEmail(email, firstName, otpCode) {
  const html = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f0f7fa;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7fa;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;
                      box-shadow:0 4px 20px rgba(0,0,0,0.10);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A6B8A,#1fa8d4);
                        padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:1px;">
                🏨 Sugar Marina Hotel
              </h1>
              <p style="margin:6px 0 0;color:#cce9f5;font-size:13px;letter-spacing:2px;">
                COLLECTION
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;color:#333;font-size:16px;">
                เรียน คุณ <strong>${firstName}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#555;font-size:14px;line-height:1.7;">
                ขอบคุณที่เลือกพักกับเรา กรุณาใช้รหัส OTP ด้านล่างเพื่อยืนยันที่อยู่อีเมลของท่าน:
              </p>

              <!-- OTP Box -->
              <div style="background:#f0f7fa;border:2px dashed #1A6B8A;border-radius:10px;
                          padding:24px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:12px;color:#888;text-transform:uppercase;
                           letter-spacing:2px;">รหัสยืนยัน (OTP)</p>
                <p style="margin:0;font-size:48px;font-weight:700;letter-spacing:12px;
                           color:#1A6B8A;font-family:'Courier New',monospace;">
                  ${otpCode}
                </p>
                <p style="margin:12px 0 0;font-size:12px;color:#e74c3c;font-weight:600;">
                  ⏰ รหัสนี้มีอายุ 10 นาที
                </p>
              </div>

              <p style="margin:0 0 8px;color:#555;font-size:13px;line-height:1.7;">
                กรอกรหัสนี้ในหน้าลงทะเบียนเพื่อเสร็จสิ้นการยืนยัน
                หลังจากนั้นท่านจะสามารถรับสิทธิพิเศษสำหรับสมาชิกของโรงแรมได้ทันที
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e8f4f8;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;background:#fafeff;">
              <p style="margin:0 0 6px;font-size:12px;color:#999;line-height:1.6;">
                หากท่านไม่ได้ร้องขอ OTP นี้ กรุณาติดต่อ Reception ของเราทันที<br/>
                โทร: +66 (0)76 000 000 &nbsp;|&nbsp; อีเมล: reception@sugarmarina.com
              </p>
              <p style="margin:16px 0 0;font-size:11px;color:#bbb;text-align:center;">
                © Sugar Marina Hotel Collection · Kata Beach, Phuket, Thailand
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Sugar Marina Hotel" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Sugar Marina Hotel — รหัสยืนยันอีเมลของท่าน',
      html,
    });
    return { success: true };
  } catch (err) {
    console.error('❌ sendOTPEmail error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { generateOTP, sendOTPEmail };
