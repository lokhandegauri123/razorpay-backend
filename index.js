// index.js
require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();

/* -------------------- MIDDLEWARE -------------------- */
app.use(cors());
app.use(express.json()); // IMPORTANT: body parsing

/* -------------------- RAZORPAY -------------------- */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* -------------------- EMAIL (NODEMAILER) -------------------- */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS, // Gmail App Password
  },
});

async function sendEmail(booking) {
  return transporter.sendMail({
    from: `"Vanutsav Agro Tourism" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: "Booking Confirmation ✔",
    html: `
      <h2>Booking Confirmed!</h2>
      <p>Thank you for booking at <strong>Vanutsav Agro Tourism</strong>.</p>
      <ul>
        <li><b>Package:</b> ${booking.packageName}</li>
        <li><b>Adults:</b> ${booking.adults}</li>
        <li><b>Kids:</b> ${booking.kids}</li>
        <li><b>Total Guests:</b> ${booking.guests}</li>
        <li><b>Amount:</b> ₹${booking.amount}</li>
      </ul>
      <p>— Vanutsav Agro Tourism</p>
    `,
  });
}

/* -------------------- SMS (FAST2SMS) -------------------- */
async function sendSMS(mobile, booking) {
  const message = `Booking Confirmed! Package: ${booking.packageName}, Guests: ${booking.guests}, Amount: ₹${booking.amount}. - Vanutsav`;

  return axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    {
      route: "q",
      message,
      language: "english",
      flash: 0,
      numbers: mobile,
    },
    {
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );
}

/* -------------------- CREATE ORDER -------------------- */
app.post("/create-order", async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Invalid amount",
        received: req.body,
      });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // rupees → paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
    });

    res.json(order);
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------- VERIFY PAYMENT -------------------- */
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      booking,
    } = req.body;

    const sign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (sign !== razorpay_signature) {
      return res.json({ status: "failed" });
    }

    // Payment verified ✔
    if (booking?.email) await sendEmail(booking);
    if (booking?.mobile) await sendSMS(booking.mobile, booking);

    res.json({ status: "success" });
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(500).json({ status: "failed" });
  }
});

/* -------------------- START SERVER (IMPORTANT) -------------------- */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
