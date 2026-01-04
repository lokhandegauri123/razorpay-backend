// // index.js
// require("dotenv").config();
// const express = require("express");
// const Razorpay = require("razorpay");
// const bodyParser = require("body-parser");
// const crypto = require("crypto");
// const cors = require("cors");

// const app = express();

// // Middlewares
// app.use(cors());
// app.use(bodyParser.json());

// // Razorpay Instance
// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

// // ------------------------
// // CREATE ORDER (Frontend calls this)
// // ------------------------
// app.post("/create-order", async (req, res) => {
//   try {
//     const { amount } = req.body;

//     if (!amount || isNaN(amount)) {
//       return res.status(400).json({ error: "Invalid amount" });
//     }

//     // Convert rupees (1597) → paise (159700)
//     const amountInPaise = Math.round(Number(amount) * 100);

//     const options = {
//       amount: amountInPaise,
//       currency: "INR",
//       receipt: `receipt_${Date.now()}`,
//       payment_capture: 1,
//     };

//     const order = await razorpay.orders.create(options);
//     res.json(order);
//   } catch (error) {
//     console.error("❌ Error creating order:", error);
//     res.status(500).json({ error: "Server error creating Razorpay order" });
//   }
// });

// // ------------------------
// // VERIFY PAYMENT SIGNATURE
// // ------------------------
// app.post("/verify-payment", (req, res) => {
//   const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
//     req.body;

//   const sign = crypto
//     .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//     .update(razorpay_order_id + "|" + razorpay_payment_id)
//     .digest("hex");

//   if (sign === razorpay_signature) {
//     return res.json({ status: "success" });
//   } else {
//     return res.json({ status: "failed" });
//   }
// });


// // ------------------------
// // Start Server
// // ------------------------
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));


// index.js
require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------------
// Nodemailer for Email
// ------------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS, // Gmail App Password
  },
});

// Send Email Function
async function sendEmail(booking) {
  const mailOptions = {
    from: `"Vanutsav Agro Tourism" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: "Booking Confirmation ✔",
    html: `
      <h2>Booking Confirmed!</h2>
      <p>Thank you for your booking at <strong>Vanutsav Agro Tourism</strong>.</p>

      <h3>Booking Details:</h3>
      <ul>
        <li><strong>Package:</strong> ${booking.packageName}</li>
        <li><strong>Adults:</strong> ${booking.adults}</li>
        <li><strong>Kids:</strong> ${booking.kids}</li>
        <li><strong>Total Guests:</strong> ${booking.guests}</li>
        <li><strong>Total Amount:</strong> ₹${booking.amount}</li>
      </ul>

      <p>We will contact you soon with further details.</p>
      <p>— Vanutsav Agro Tourism</p>
    `,
  };

  return transporter.sendMail(mailOptions);
}

// ------------------------
// Fast2SMS - SMS Notification
// ------------------------
async function sendSMS(mobile, booking) {
  const message = `Booking Confirmed! Package: ${booking.packageName}, Guests: ${booking.guests}, Amount: ₹${booking.amount}. - Vanutsav`;

  const url = `https://www.fast2sms.com/dev/bulkV2`;

  return axios.post(
    url,
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

// ------------------------
// CREATE ORDER
// ------------------------
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Convert rupees → paise
    const amountInPaise = Math.round(Number(amount) * 100);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error("❌ Error creating order:", error);
    res.status(500).json({ error: "Server error creating Razorpay order" });
  }
});

// ------------------------
// VERIFY PAYMENT + SEND EMAIL + SMS
// ------------------------
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      booking,
    } = req.body;

    // Signature verification
    const sign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (sign !== razorpay_signature) {
      return res.json({ status: "failed" });
    }

    // ---------------------
    // PAYMENT VERIFIED ✔
    // ---------------------

    // Send Email
    if (booking.email) {
      await sendEmail(booking);
      console.log("📧 Email sent to:", booking.email);
    }

    // Send SMS
    if (booking.mobile) {
      await sendSMS(booking.mobile, booking);
      console.log("📩 SMS sent to:", booking.mobile);
    }

    return res.json({ status: "success" });
  } catch (error) {
    console.error("❌ Verification Error:", error);
    return res.status(500).json({ status: "failed", error: error.message });
  }
});

// ------------------------
// Start Server
// ------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
