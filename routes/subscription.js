const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

router.post('/stk-push', auth, async (req, res) => {
  const { phone, plan } = req.body;
  const amount = plan === 'weekly'? 100 : 350;
  
  try {
    await axios.post('https://api.payhero.co.ke/stk-push', {
      amount,
      phone,
      channel_id: process.env.PAYHERO_CHANNEL_ID,
      external_reference: req.userId,
      callback_url: 'https://your-domain.com/api/subscription/callback'
    }, {
      headers: { Authorization: process.env.PAYHERO_AUTH_TOKEN }
    });

    res.json({ message: 'STK push sent. Complete payment on your phone.' });
  } catch (e) {
    res.status(500).json({ error: 'Payment failed' });
  }
});

router.post('/callback', async (req, res) => {
  const { Status, ExternalReference, Amount } = req.body;
  if (Status === 'Success') {
    const plan = Amount == 100? 'weekly' : 'monthly';
    const days = plan === 'weekly'? 7 : 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    
    await User.findByIdAndUpdate(ExternalReference, {
      'subscription.active': true,
      'subscription.plan': plan,
      'subscription.expiresAt': expiresAt
    });
  }
  res.json({ ResultCode: 0 });
});

module.exports = router;
