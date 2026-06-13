const express = require('express');
const auth = require('../middleware/auth');
const Opportunity = require('../models/Opportunity');
const User = require('../models/User');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isPro = user.subscription?.active && user.subscription.expiresAt > new Date();
    
    let query = { tradable: true };
    if (!isPro) query.spread = { $lt: '2.00' };
    
    const opps = await Opportunity.find(query).sort({ spread: -1 }).limit(50);
    res.json(opps);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Not found' });
    res.json(opp);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
