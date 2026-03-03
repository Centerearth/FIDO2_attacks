const express = require('express');
const DB = require('./database.js');

const router = express.Router();

// JSON body parsing using built-in middleware
router.use(express.json());

// GetScores
router.get('/review/:class', async (req, res) => {
  const classUsed = req.params.class;
  const reviews = await DB.getReview(classUsed);
  res.send(reviews);
});

// SubmitScore
router.post('/review/:class', async (req, res) => {
  await DB.addReview(req.body);
  const classUsed = req.params.class;
  const reviews = await DB.getReview(classUsed);
  res.send(reviews);
});

module.exports = router;
